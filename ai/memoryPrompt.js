import { SYSTEM_PROMPT } from "./prompts.js";

export function buildMessages({ recent, context, currentText, summary = "" }) {
  const memoryText = context.memories.length
    ? context.memories.map(m => `- (${m.type}) ${m.text}`).join("\n")
    : "No matching long-term facts found.";
  const oldText = context.oldMessages.length
    ? context.oldMessages.map(m => `${m.role === "user" ? "Other person" : "Sajib's reply"}: ${m.content}`).join("\n")
    : "No semantically relevant old messages found.";
  const recentText = recent.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content
  }));
  return [
    { role: "system", content: `${SYSTEM_PROMPT}\n\nConversation summary (may be empty):\n${summary || "No summary yet."}\n\nRelevant long-term memories:\n${memoryText}\n\nRelevant older messages:\n${oldText}` },
    ...recentText,
    { role: "user", content: currentText }
  ];
}
