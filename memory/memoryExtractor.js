import Memory from "../models/Memory.js";
import Chat from "../models/Chat.js";
import Feedback from "../models/Feedback.js";
import { MEMORY_EXTRACTION_PROMPT } from "../ai/prompts.js";
import { chatCompletion, parseJsonObject } from "../ai/groq.js";
import { config } from "../config/env.js";
import { embedText } from "../services/embeddings.js";
import { getRecentMessages } from "./conversationStore.js";

export async function extractLongTermMemories(chatId, sourceMessageId) {
  const recent = await getRecentMessages(chatId, 16);
  if (!recent.length) return;
  const transcript = recent.map(m => `${m.role === "user" ? "Other person" : "Sajib's reply"}: ${m.content}`).join("\n");
  try {
    const result = await chatCompletion({
      model: config.strongModel,
      maxTokens: 500,
      temperature: 0.1,
      messages: [
        { role: "system", content: MEMORY_EXTRACTION_PROMPT },
        { role: "user", content: transcript }
      ]
    });
    const parsed = parseJsonObject(result);
    const memories = Array.isArray(parsed.memories) ? parsed.memories.slice(0, 8) : [];
    for (const item of memories) {
      if (!item?.text || typeof item.text !== "string") continue;
      const text = item.text.trim().slice(0, 500);
      if (!text || /password|api key|secret key|verification code|one-time code/i.test(text)) continue;
      const embedding = await embedText(text).catch(() => []);
      const type = String(item.type || "fact").slice(0, 40);
      const importance = Math.max(1, Math.min(10, Number(item.importance) || 5));
      // Avoid repeated facts by updating a very similar existing memory.
      const existing = await Memory.findOne({ chatId, text: { $regex: new RegExp(escapeRegex(text.slice(0, 70)), "i") } });
      if (existing) {
        existing.text = text;
        existing.type = type;
        existing.importance = Math.max(existing.importance || 5, importance);
        existing.embedding = embedding;
        existing.sourceMessageId = sourceMessageId;
        existing.updatedAt = new Date();
        existing.active = true;
        await existing.save();
      } else {
        await Memory.create({ chatId, type, text, importance, embedding, sourceMessageId, updatedAt: new Date() });
      }
    }
  } catch (error) {
    console.warn("Long-term memory extraction failed:", error.message);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function maybeExtractMemories(chatId, sourceMessageId) {
  const chat = await Chat.findOneAndUpdate(
    { chatId },
    { $inc: { userMessagesSinceExtraction: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true }
  );
  if ((chat.userMessagesSinceExtraction || 0) >= config.extractEvery) {
    await Chat.updateOne({ chatId }, { $set: { userMessagesSinceExtraction: 0 } });
    // Do not block the reply on extraction.
    extractLongTermMemories(chatId, sourceMessageId).catch(err => console.error("Memory background task:", err.message));
  }
}

export async function saveReplyFeedback({ chatId, sourceMessageId, generatedReply, finalReply }) {
  if (!generatedReply || !finalReply || generatedReply.trim() === finalReply.trim()) return;
  await Feedback.create({ chatId, sourceMessageId, generatedReply, finalReply });
}
