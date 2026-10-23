import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import { embedText } from "../services/embeddings.js";

export async function saveMessage({ chatId, messageId, senderId = "", role, content, isVoice = false, replyToMessageId = null }) {
  const clean = String(content || "").trim();
  if (!clean) return null;
  let embedding;
  try {
    embedding = await embedText(clean);
  } catch (error) {
    console.warn("Embedding failed; saving message without vector:", error.message);
  }
  return Message.findOneAndUpdate(
    { chatId, messageId, role },
    {
      $setOnInsert: {
        chatId, messageId, senderId, role, content: clean, isVoice, replyToMessageId,
        createdAt: new Date(),
        ...(embedding?.length ? { embedding } : {})
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Recent messages for prompts — skip the heavy embedding field entirely. */
export async function getRecentMessages(chatId, limit = 12) {
  const docs = await Message.find({ chatId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .select("role content isVoice createdAt messageId")
    .lean();
  return docs.reverse();
}

export async function getChat(chatId) {
  return Chat.findOneAndUpdate(
    { chatId },
    { $setOnInsert: { chatId }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function updateChat(chatId, update) {
  return Chat.findOneAndUpdate({ chatId }, { $set: { ...update, updatedAt: new Date() } }, { upsert: true, new: true });
}

export async function deleteChatMemory(chatId) {
  await Promise.all([
    Message.deleteMany({ chatId }),
    (await import("../models/Memory.js")).default.deleteMany({ chatId }),
    Chat.deleteOne({ chatId })
  ]);
}
