import { chatCompletion } from "../ai/groq.js";
import { QUERY_REWRITE_PROMPT } from "../ai/prompts.js";
import { config } from "../config/env.js";

const VOICE_PREFIX_RE = /^\[voice note transcription\]:\s*/i;
const NOISE_RE = /\b(um+|uh+|umm|like|i mean|sort of|kind of|you know)\b/i;

/**
 * Decide whether memory search benefits from a cleaned-up query.
 * Voice transcriptions, very short texts, and noisy sentences gain the most;
 * clean long text messages already embed well on their own.
 */
export function shouldRewriteQuery(text, { isVoice = false } = {}) {
  if (!config.enableQueryRewrite) return false;
  if (isVoice || VOICE_PREFIX_RE.test(text)) return true;
  const words = text.trim().split(/\s+/);
  return words.length <= 8 || NOISE_RE.test(text) || text.includes("?");
}

/** Rewrite a noisy/short query into a clean keyword query for memory search. */
export async function rewriteQuery(text, { summary = "" } = {}) {
  const raw = text.replace(VOICE_PREFIX_RE, "").trim();
  if (!raw) return text;
  try {
    const contextLines = summary ? `Conversation summary for context: ${summary.slice(0, 300)}` : "";
    const result = await chatCompletion({
      model: config.fastModel,
      maxTokens: 120,
      temperature: 0,
      reasoningEffort: "low",
      timeoutMs: 12000,
      retries: 0,
      messages: [
        { role: "system", content: QUERY_REWRITE_PROMPT },
        { role: "user", content: `${contextLines ? `${contextLines}\n\n` : ""}Query: ${raw.slice(0, 500)}` }
      ]
    });
    const clean = result.replace(/^["'\s]+|["'\s]+$/g, "");
    return clean || raw;
  } catch {
    return raw; // never let rewriting block the reply
  }
}
