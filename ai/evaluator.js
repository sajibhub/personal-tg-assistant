import { chatCompletion } from "./groq.js";
import { config } from "../config/env.js";

/**
 * Judge two parallel drafts and return only the winner.
 * Runs on the strong model with light reasoning — fast, but picks smarter.
 */
export async function chooseBetterReply({ messages, candidateA, candidateB }) {
  const lastUser = messages.at(-1)?.content || "";
  const judgePrompt = [
    "Two candidate replies were drafted for the last message in this conversation.",
    "Pick the better one using these criteria, in order:",
    "1) Correctness & relevance — answers what was actually asked, uses known facts only, invents nothing.",
    "2) Language match — same language and script as the other person.",
    "3) Natural tone — sounds like a real human in this exact chat.",
    "4) Concision — no padding, no repeated ideas, no unnecessary emojis.",
    "Return ONLY the winning reply text, unchanged. No commentary, no labels.",
    "",
    "LAST MESSAGE:",
    lastUser,
    "",
    "DRAFT A:",
    candidateA,
    "",
    "DRAFT B:",
    candidateB
  ].join("\n");

  const chosen = await chatCompletion({
    model: config.strongModel,
    maxTokens: 800,
    temperature: 0.1,
    reasoningEffort: "low",
    timeoutMs: 25000,
    messages: [
      ...messages.slice(0, -1),
      { role: "user", content: judgePrompt }
    ]
  });

  // Guard: the judge must return one of the drafts, otherwise fall back to A.
  const clean = chosen?.trim();
  if (!clean) return candidateA;
  if (clean === candidateA.trim()) return candidateA;
  if (clean === candidateB.trim()) return candidateB;
  // Judge rewrote slightly (e.g. trimmed quotes) — accept if it is plausibly one of them.
  const stripped = clean.replace(/^["']|["']$/g, "");
  if (stripped === candidateA.trim()) return candidateA;
  if (stripped === candidateB.trim()) return candidateB;
  return candidateA.length <= candidateB.length ? candidateA : candidateB;
}
