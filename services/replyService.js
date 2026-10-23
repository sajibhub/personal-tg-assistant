import { getRecentMessages, getChat } from "../memory/conversationStore.js";
import { retrieveRelevantContext } from "../memory/semanticSearch.js";
import { buildMessages } from "../ai/memoryPrompt.js";
import { generateReply } from "../ai/router.js";

export async function createReply(chatId, text) {
  const [chat, recent] = await Promise.all([
    getChat(chatId),
    getRecentMessages(chatId, Number(process.env.RECENT_MESSAGES || 12))
  ]);
  const context = await retrieveRelevantContext(chatId, text);
  // The incoming message was archived before this function runs. Remove its
  // latest occurrence from recent context because buildMessages adds it below.
  const recentForPrompt = recent.map(m => ({ role: m.role, content: m.content }));
  const last = recentForPrompt.at(-1);
  if (last?.role === "user" && last.content === text) recentForPrompt.pop();
  const messages = buildMessages({
    recent: recentForPrompt,
    context,
    currentText: text,
    summary: chat.summary || ""
  });
  const reply = await generateReply(messages, text);
  return { reply, contextUsed: { memories: context.memories.length, oldMessages: context.oldMessages.length } };
}
