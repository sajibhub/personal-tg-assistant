import Message from "../models/Message.js";
import Memory from "../models/Memory.js";
import { embedText, cosineSimilarity } from "../services/embeddings.js";
import { config } from "../config/env.js";

export async function retrieveRelevantContext(chatId, query) {
  let queryVector;
  try { queryVector = await embedText(query); } catch (error) {
    console.warn("Query embedding failed:", error.message);
    return { memories: [], oldMessages: [] };
  }
  if (!queryVector.length) return { memories: [], oldMessages: [] };

  // Application-side cosine search avoids requiring an Atlas Vector Search index.
  // For very large collections, replace this with Atlas Vector Search.
  const [memoryDocs, messageDocs] = await Promise.all([
    Memory.find({ chatId, active: true, embedding: { $exists: true, $ne: [] } }).sort({ updatedAt: -1 }).limit(1500).lean(),
    Message.find({ chatId, embedding: { $exists: true, $ne: [] } }).sort({ createdAt: -1 }).limit(2500).lean()
  ]);

  const memories = memoryDocs
    .map(doc => ({ ...doc, score: cosineSimilarity(queryVector, doc.embedding) + (doc.importance || 5) / 100 }))
    .filter(doc => doc.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, config.memoryResults);

  const oldMessages = messageDocs
    .map(doc => ({ ...doc, score: cosineSimilarity(queryVector, doc.embedding) }))
    .filter(doc => doc.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return {
    memories: memories.map(m => ({ type: m.type, text: m.text, importance: m.importance })),
    oldMessages: oldMessages.map(m => ({ role: m.role, content: m.content, createdAt: m.createdAt }))
  };
}
