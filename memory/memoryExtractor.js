import Memory from "../models/Memory.js";
import Chat from "../models/Chat.js";
import Feedback from "../models/Feedback.js";
import { MEMORY_EXTRACTION_PROMPT } from "../ai/prompts.js";
import { chatCompletion, parseJsonObject } from "../ai/groq.js";
import { config } from "../config/env.js";
import { embedBatch, embedText, cosineSimilarity } from "../services/embeddings.js";
import { getRecentMessages } from "./conversationStore.js";

const SENSITIVE_RE = /password|passcode|pin code|\bpin\b|api[ _-]?key|secret[ _-]?key|verification code|one-time code|\botp\b|credit card|debit card|cvv|bank account|\biban\b|swift code/i;

export async function extractLongTermMemories(chatId, sourceMessageId) {
  const recent = await getRecentMessages(chatId, 16);
  if (recent.length < 2) return;
  const transcript = recent.map(m => `${m.role === "user" ? "Other person" : "Sajib's reply"}: ${m.content}`).join("\n");

  try {
    const result = await chatCompletion({
      model: config.strongModel,
      maxTokens: 700,
      temperature: 0.1,
      reasoningEffort: "low",
      timeoutMs: 30000,
      messages: [
        { role: "system", content: MEMORY_EXTRACTION_PROMPT },
        { role: "user", content: transcript }
      ]
    });
    const parsed = parseJsonObject(result);
    const memories = Array.isArray(parsed.memories) ? parsed.memories.slice(0, 8) : [];
    const valid = [];
    for (const item of memories) {
      if (!item?.text || typeof item.text !== "string") continue;
      const text = item.text.trim().slice(0, 500);
      if (!text || SENSITIVE_RE.test(text)) continue;
      valid.push({
        text,
        type: String(item.type || "fact").slice(0, 40),
        importance: Math.max(1, Math.min(10, Number(item.importance) || 5))
      });
    }
    if (!valid.length) return;

    // One batched embedding pass instead of one call per memory.
    const vectors = await embedBatch(valid.map(v => v.text));

    // Load the chat's existing memories once for smart (embedding) dedupe.
    const existing = await Memory.find({ chatId, active: true })
      .select("text type importance embedding")
      .limit(1000)
      .lean();

    for (let i = 0; i < valid.length; i++) {
      const { text, type, importance } = valid[i];
      const embedding = vectors[i] || (await embedText(text).catch(() => []));

      // 1) Near-duplicate by meaning (cosine > 0.90) -> merge.
      let match = null;
      for (const doc of existing) {
        if (doc.embedding?.length && embedding.length &&
            cosineSimilarity(embedding, doc.embedding) > 0.90) {
          match = doc;
          break;
        }
      }
      // 2) Cheap exact-ish text match as a second net.
      if (!match) {
        const escaped = text.slice(0, 70).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        match = await Memory.findOne({ chatId, text: { $regex: new RegExp(escaped, "i") } })
          .select("text type importance embedding")
          .lean();
      }

      if (match) {
        // Keep the sharper wording; carry over the higher importance.
        await Memory.updateOne(
          { _id: match._id },
          {
            $set: {
              text: text.length >= (match.text || "").length ? text : match.text,
              type,
              importance: Math.max(match.importance || 5, importance),
              embedding: embedding.length ? embedding : match.embedding,
              sourceMessageId,
              updatedAt: new Date(),
              active: true
            }
          }
        );
      } else {
        const created = await Memory.create({ chatId, type, text, importance, embedding, sourceMessageId, updatedAt: new Date() });
        existing.push({ _id: created._id, text, type, importance, embedding });
      }
    }
  } catch (error) {
    console.warn("Long-term memory extraction failed:", error.message);
  }
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
