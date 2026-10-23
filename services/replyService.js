import { getRecentMessages, getChat } from "../memory/conversationStore.js";
import { retrieveRelevantContext } from "../memory/semanticSearch.js";
import { buildMessages } from "../ai/memoryPrompt.js";
import { generateReply } from "../ai/router.js";
import { shouldRewriteQuery, rewriteQuery } from "./queryRewrite.js";
import { config } from "../config/env.js";

/**
 * Reply orchestration:
 * 1. load chat + recent history (+ rolling summary) in parallel
 * 2. optionally rewrite noisy/short queries (voice notes) for better memory hits
 * 3. hybrid semantic search over memories + older messages
 * 4. max-brain reply generation (parallel drafts + judge when useful)
 */
export async function createReply(chatId, text, { isVoice = false } = {}) {
  const [chat, recent] = await Promise.all([
    getChat(chatId),
    getRecentMessages(chatId, config.recentMessages)
  ]);

  const summary = chat.summary || "";
  let searchQuery = text;
  if (shouldRewriteQuery(text, { isVoice })) {
    searchQuery = await rewriteQuery(text, { summary });
  }

  const [context] = await Promise.all([
    retrieveRelevantContext(chatId, searchQuery)
  ]);

  // The incoming message was archived before this function runs. Remove its
  // latest occurrence from recent context because buildMessages adds it below.
  const recentForPrompt = recent.map(m => ({ role: m.role, content: m.content }));
  const last = recentForPrompt.at(-1);
  if (last?.role === "user" && last.content === text) recentForPrompt.pop();

  const messages = buildMessages({
    recent: recentForPrompt,
    context,
    currentText: text,
    summary
  });

  const reply = await generateReply(messages, text);
  return {
    reply,
    contextUsed: {
      memories: context.memories.length,
      oldMessages: context.oldMessages.length
    }
  };
}
