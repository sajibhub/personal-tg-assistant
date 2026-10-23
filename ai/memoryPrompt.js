import { SYSTEM_PROMPT } from "./prompts.js";
import { config } from "../config/env.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nowText() {
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: config.timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(new Date());
    return `${formatted} (${config.timezone})`;
  } catch {
    const now = new Date();
    return `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  }
}

export function buildMessages({ recent, context, currentText, summary = "" }) {
  const memoryText = context.memories.length
    ? context.memories.map(m => `- (${m.type}, importance ${m.importance ?? "?"}/10) ${m.text}`).join("\n")
    : "No matching long-term facts found.";
  const oldText = context.oldMessages.length
    ? context.oldMessages.map(m => `${m.role === "user" ? "Other person" : "Sajib's reply"}: ${m.content}`).join("\n")
    : "No semantically relevant older messages found.";

  const systemBlock = [
    SYSTEM_PROMPT,
    "",
    `Current date/time: ${nowText()}`,
    "",
    "Conversation summary (older context; may be empty):",
    summary || "No summary yet.",
    "",
    "Relevant long-term memories:",
    memoryText,
    "",
    "Relevant older messages (retrieved by similarity):",
    oldText
  ].join("\n");

  const recentText = recent.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content
  }));

  return [
    { role: "system", content: systemBlock },
    ...recentText,
    { role: "user", content: currentText }
  ];
}
