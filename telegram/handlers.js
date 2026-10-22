import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NewMessage } from "telegram/events/index.js";
import { client } from "./client.js";
import { config } from "../config/env.js";
import { saveMessage, getChat, updateChat, deleteChatMemory } from "../memory/conversationStore.js";
import { maybeExtractMemories } from "../memory/memoryExtractor.js";
import { maybeSummarizeChat, summarizeNow } from "../services/summarizer.js";
import { createReply } from "../services/replyService.js";
import { transcribeAudio, buildTranscriptionHint } from "../services/transcribe.js";
import { getRecentMessages } from "../memory/conversationStore.js";
import { withTyping, safeSendText } from "./typing.js";
import { sendReply } from "./voiceReply.js";

const queues = new Map();

// Used to ignore messages that arrived before the bot started (no zombie replies).
const startedAt = Math.floor(Date.now() / 1000) - 5;

function enqueue(chatId, task) {
  const previous = queues.get(chatId) || Promise.resolve();
  const next = previous.catch(() => {}).then(task).finally(() => {
    if (queues.get(chatId) === next) queues.delete(chatId);
  });
  queues.set(chatId, next);
  return next;
}

function isVoiceNote(message) {
  const doc = message.media?.document;
  if (!doc) return false;
  return (doc.mimeType || "").startsWith("audio/") ||
    (doc.attributes || []).some(a => a.className === "DocumentAttributeAudio");
}

function isRoundVideo(message) {
  const doc = message.media?.document;
  if (!doc) return false;
  return (doc.attributes || []).some(a => a.className === "DocumentAttributeVideo" && a.roundMessage);
}

async function extractIncomingText(message) {
  // 1) Plain text (also photo captions).
  if (message.message?.trim()) return { text: message.message.trim(), isVoice: false };

  const doc = message.media?.document;
  if (!doc || (!isVoiceNote(message) && !isRoundVideo(message))) return null;

  const tempPath = path.join(os.tmpdir(), `telegram-voice-${randomUUID()}.ogg`);
  try {
    await client.downloadMedia(message.media, { outputFile: tempPath });
    const hint = buildTranscriptionHint(await getRecentMessages(String(message.chatId), 8));
    const text = await transcribeAudio(tempPath, { contextHint: hint });
    return text
      ? { text: `[Voice note transcription]: ${text}`, isVoice: true, rawTranscript: text }
      : { text: "", isVoice: true, failed: true };
  } finally {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
  }
}

async function handleCommand(message, incoming) {
  const command = incoming.text.trim().toLowerCase();
  const chatId = String(message.chatId);

  if (command === "/forget") {
    await deleteChatMemory(chatId);
    await safeSendText(chatId, "Cleared this app's saved memory for this chat.", { replyTo: message.id });
    return true;
  }
  if (command === "/ai off") {
    await updateChat(chatId, { autoReply: false });
    await safeSendText(chatId, "Auto-replies are off for this chat.", { replyTo: message.id });
    return true;
  }
  if (command === "/ai on") {
    await updateChat(chatId, { autoReply: true });
    await safeSendText(chatId, "Auto-replies are on for this chat.", { replyTo: message.id });
    return true;
  }
  if (command === "/summary") {
    await enqueue(chatId, async () => {
      const summary = await summarizeNow(chatId);
      await safeSendText(chatId, summary.slice(0, 4000), { replyTo: message.id });
    });
    return true;
  }
  return false;
}

export function registerTelegramHandlers() {
  client.addEventHandler(async (event) => {
    const message = event.message;
    try {
      if (!message || message.out || message.isGroup || message.isChannel) return;
      if (config.ignoreOldMessages && message.date && message.date < startedAt) return;

      const sender = await message.getSender().catch(() => null);
      if (!sender || sender.bot) return;

      const chatId = String(message.chatId);
      const incoming = await extractIncomingText(message);
      if (!incoming) {
        if (message.media) return; // stickers/photos without caption etc.
        return;
      }

      // Voice note that Whisper could not understand.
      if (incoming.failed) {
        if (config.autoReply) {
          await safeSendText(
            chatId,
            "Sorry, I couldn't hear that clearly — could you send it again or type it?",
            { replyTo: message.id }
          );
        }
        return;
      }
      if (!incoming.text) return;

      if (await handleCommand(message, incoming)) return;

      // Persist every incoming text/transcription, even when auto-reply is disabled.
      await saveMessage({
        chatId, messageId: message.id, senderId: String(sender.id || ""),
        role: "user", content: incoming.text, isVoice: incoming.isVoice,
        replyToMessageId: message.replyTo?.replyToMsgId ?? null
      });

      const chat = await getChat(chatId);
      await maybeExtractMemories(chatId, message.id);
      maybeSummarizeChat(chatId).catch(err => console.warn("Summary task:", err.message));

      if (!config.autoReply || chat.autoReply === false) return;

      await enqueue(chatId, async () => {
        const { reply, contextUsed } = await createReply(chatId, incoming.text, { isVoice: incoming.isVoice });
        if (!reply) return;

        // Voice in -> voice out (with text fallback when TTS can't speak it).
        const asVoice = incoming.isVoice && config.voiceReplies && chat.autoReply !== false;
        const result = await withTyping(chatId, () =>
          sendReply(chatId, reply, { replyTo: message.id, asVoice })
        );

        if (!result) return;
        await saveMessage({
          chatId, messageId: result.sent.id, role: "assistant",
          content: reply.slice(0, 4000),
          replyToMessageId: message.id
        });
      });
    } catch (error) {
      console.error("Telegram handler error:", error?.stack || error?.message || error);
    }
  }, new NewMessage({ incoming: true, outgoing: false }));
}
