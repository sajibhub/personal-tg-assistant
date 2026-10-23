import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import { SUMMARY_PROMPT } from "../ai/prompts.js";
import { chatCompletion } from "../ai/groq.js";
import { config } from "../config/env.js";
import { getRecentMessages, getChat, updateChat } from "./conversationStore.js";

/**
 * Rolling conversation summary.
 * Every SUMMARY_EVERY user messages the background task merges the previous
 * summary with everything that happened since, so long chats never lose
 * context even though only the last N messages are kept in the prompt.
 */

export function transcriptFromMessages(messages) {
  return messages
    .map(m => `${m.role === "user" ? "Other person" : "Sajib's reply"}: ${m.content}`)
    .join("\n")
    .slice(0, 8000);
}

export async function generateChatSummary(previousSummary, messages) {
  const transcript = transcriptFromMessages(messages);
  if (!transcript.trim()) return null;
  const result = await chatCompletion({
    model: config.strongModel,
    maxTokens: 700,
    temperature: 0.2,
    reasoningEffort: "low",
    timeoutMs: 30000,
    messages: [
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: `PREVIOUS SUMMARY:\n${previousSummary || "(none)"}\n\nNEW MESSAGES:\n${transcript}` }
    ]
  });
  return result ? result.replace(/\s+/g, " ").trim().slice(0, 1200) : null;
}

/** Background job: refresh the rolling summary when enough new messages exist. */
export async function maybeSummarizeChat(chatId) {
  try {
    const chat = await getChat(chatId);
    const sinceId = chat.summaryUpToMessageId || 0;
    const fresh = await Message.find({ chatId, messageId: { $gt: sinceId } })
      .sort({ messageId: 1 })
      .limit(config.summaryEvery + 40)
      .select("role content messageId")
      .lean();

    if (fresh.length < config.summaryEvery) return;

    const summary = await generateChatSummary(chat.summary || "", fresh);
    const maxId = Math.max(...fresh.map(m => m.messageId));
    await updateChat(chatId, {
      summary: summary || chat.summary || "",
      summaryUpToMessageId: maxId
    });
    console.log(`Rolling summary updated for chat ${chatId} (through message ${maxId})`);
  } catch (error) {
    console.warn("Background summary failed:", error.message);
  }
}

/** On-demand summary for the /summary command. */
export async function summarizeNow(chatId) {
  const chat = await getChat(chatId);
  const recent = await getRecentMessages(chatId, 50);
  if (!recent.length) return "There is no conversation saved yet, so nothing to summarize.";
  const summary = await generateChatSummary(chat.summary || "", recent);
  if (!summary) return "I couldn't generate a summary right now — try again in a moment.";
  return `Summary of this chat so far:\n\n${summary}`;
}
