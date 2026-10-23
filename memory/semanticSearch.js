import Message from "../models/Message.js";
import Memory from "../models/Memory.js";
import { embedText, cosineSimilarity } from "../services/embeddings.js";
import { config } from "../config/env.js";

function recencyBoost(date, halfLifeDays) {
  const ageDays = (Date.now() - new Date(date).getTime()) / 86400000;
  return Math.exp(-ageDays / halfLifeDays);
}

/**
 * Hybrid semantic search with smarter ranking:
 *   score = cosine similarity + importance weight + recency boost
 * Long-term memories also get a similarity dedupe so near-duplicate notes
 * never crowd out distinct facts.
 */
export async function retrieveRelevantContext(chatId, query) {
  let queryVector;
  try {
    queryVector = await embedText(query);
  } catch (error) {
    console.warn("Query embedding failed:", error.message);
    return { memories: [], oldMessages: [] };
  }
  if (!queryVector.length) return { memories: [], oldMessages: [] };

  // Application-side cosine search avoids requiring an Atlas Vector Search index.
  // For very large collections, replace this with Atlas Vector Search.
  const [memoryDocs, messageDocs] = await Promise.all([
    Memory.find({ chatId, active: true, embedding: { $exists: true, $ne: [] } })
      .sort({ updatedAt: -1 }).limit(1200)
      .select("type text importance embedding updatedAt")
      .lean(),
    Message.find({ chatId, embedding: { $exists: true, $ne: [] } })
      .sort({ createdAt: -1 }).limit(2500)
      .select("role content embedding createdAt isVoice")
      .lean()
  ]);

  const rankedMemories = memoryDocs
    .map(doc => ({
      type: doc.type,
      text: doc.text,
      importance: doc.importance || 5,
      score: cosineSimilarity(queryVector, doc.embedding)
        + (doc.importance || 5) / 100
        + 0.04 * recencyBoost(doc.updatedAt, 14)
    }))
    .filter(doc => doc.score > 0.25)
    .sort((a, b) => b.score - a.score);

  // Dedupe near-identical retrieved memories (keeps the highest scored one).
  const deduped = [];
  const dedupeVectors = [];
  for (const memory of rankedMemories) {
    if (deduped.length >= config.memoryResults) break;
    let vector;
    try { vector = await embedText(memory.text); } catch { continue; }
    const isDuplicate = dedupeVectors.some(v => cosineSimilarity(vector, v) > 0.92);
    if (!isDuplicate) {
      deduped.push(memory);
      dedupeVectors.push(vector);
    }
  }

  const oldMessages = messageDocs
    .map(doc => ({
      role: doc.role,
      content: doc.content,
      createdAt: doc.createdAt,
      score: cosineSimilarity(queryVector, doc.embedding) + 0.05 * recencyBoost(doc.createdAt, 7)
    }))
    .filter(doc => doc.score > 0.32)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return {
    memories: deduped.map(m => ({ type: m.type, text: m.text, importance: m.importance })),
    oldMessages: oldMessages.map(m => ({ role: m.role, content: m.content, createdAt: m.createdAt }))
  };
}
