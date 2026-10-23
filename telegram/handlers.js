import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NewMessage } from "telegram/events/index.js";
import { client } from "./client.js";
import { config } from "../config/env.js";
import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import { saveMessage, getChat, updateChat, deleteChatMemory } from "../memory/conversationStore.js";
import { maybeExtractMemories } from "../memory/memoryExtractor.js";
import { createReply } from "../services/replyService.js";
import { transcribeAudio } from "../services/transcribe.js";

const queues = new Map();

function enqueue(chatId, task) {
  const previous = queues.get(chatId) || Promise.resolve();
  const next = previous.catch(() => {}).then(task).finally(() => {
    if (queues.get(chatId) === next) queues.delete(chatId);
  });
  queues.set(chatId, next);
  return next;
}

function isAudioDocument(doc) {
  const mime = doc?.mimeType || "";
  return mime.startsWith("audio/") || mime.startsWith("video/") || (doc?.attributes || []).some(a => a.className === "DocumentAttributeAudio");
}

async function extractIncomingText(message) {
  if (message.message?.trim()) return { text: message.message.trim(), isVoice: false };
  const doc = message.media?.document;
  if (!doc || !isAudioDocument(doc)) return null;

  const tempPath = path.join(os.tmpdir(), `telegram-voice-${randomUUID()}.audio`);
  try {
    await client.downloadMedia(message.media, { outputFile: tempPath });
    const text = await transcribeAudio(tempPath);
    return text ? { text: `[Voice note transcription]: ${text}`, isVoice: true } : null;
  } finally {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
  }
}

export function registerTelegramHandlers() {
  client.addEventHandler(async (event) => {
    const message = event.message;
    try {
      if (!message || message.out || message.isGroup || message.isChannel) return;
      const sender = await message.getSender().catch(() => null);
      if (!sender || sender.bot) return;

      const chatId = String(message.chatId);
      const incoming = await extractIncomingText(message);
      if (!incoming?.text) {
        if (message.media) return;
        return;
      }

      const command = incoming.text.trim().toLowerCase();
      if (command === "/forget") {
        await deleteChatMemory(chatId);
        await client.sendMessage(chatId, { message: "Cleared this app's saved memory for this chat.", replyTo: message.id });
        return;
      }
      if (command === "/ai off") {
        await updateChat(chatId, { autoReply: false });
        await client.sendMessage(chatId, { message: "Auto-replies are off for this chat.", replyTo: message.id });
        return;
      }
      if (command === "/ai on") {
        await updateChat(chatId, { autoReply: true });
        await client.sendMessage(chatId, { message: "Auto-replies are on for this chat.", replyTo: message.id });
        return;
      }

      // Persist every incoming text/transcription, even when auto-reply is disabled.
      await saveMessage({
        chatId, messageId: message.id, senderId: String(sender.id || ""),
        role: "user", content: incoming.text, isVoice: incoming.isVoice,
        replyToMessageId: message.replyTo?.replyToMsgId ?? null
      });

      const chat = await getChat(chatId);
      await maybeExtractMemories(chatId, message.id);

      if (!config.autoReply || chat.autoReply === false) return;

      await enqueue(chatId, async () => {
        const { reply, contextUsed } = await createReply(chatId, incoming.text);
        if (!reply) return;
        const sent = await client.sendMessage(chatId, {
          message: reply.slice(0, 4000),
          replyTo: message.id,
          linkPreview: false
        });
        await saveMessage({
          chatId, messageId: sent.id, role: "assistant", content: reply.slice(0, 4000),
          replyToMessageId: message.id
        });
        console.log(`Replied in ${chatId}; memory matches=${contextUsed.memories}, old messages=${contextUsed.oldMessages}`);
      });
    } catch (error) {
      console.error("Telegram handler error:", error?.stack || error?.message || error);
    }
  }, new NewMessage({ incoming: true, outgoing: false }));
}
