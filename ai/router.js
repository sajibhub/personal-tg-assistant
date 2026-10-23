import { chatCompletion } from "./groq.js";
import { chooseBetterReply } from "./evaluator.js";
import { config } from "../config/env.js";

const TRIVIAL_RE = /^(hi|hii+|hey+|hello|yo|ok|okay|k|thanks|thank you|thx|ty|tysm|gn|gm|good morning|good night|good afternoon|lol|haha|hmm|yes|yeah|yep|no|nope|nah|sure|fine|great|nice|wow|bye|tc|take care)\b[\s!.?]*$/i;

/**
 * Tiered brain routing:
 * - trivial: greetings/acks -> 1 draft, low reasoning, still the strong model (max mode)
 * - casual : normal chat -> light reasoning
 * - complex: questions, plans, emotions, long messages -> deep reasoning + evaluation
 */
export function classifyTier(text) {
  const t = String(text || "").trim();
  const clean = t.replace(/^\[voice note transcription\]:\s*/i, "");
  if (!clean) return "trivial";
  const questionCount = (clean.match(/\?/g) || []).length;
  const complexWords = /\b(why|explain|compare|relationship|problem|help me decide|what should|how do|because|actually|yesterday|before|remember|plan|promise|urgent|sorry|angry|sad|love|break up|technical|debug|error|important|decide|think about|advice)\b/i.test(clean);
  const long = clean.length > 220;
  const multiQuestion = questionCount > 1;

  if (config.brainMode === "fast") return clean.length > 400 || multiQuestion ? "complex" : "casual";
  if (t.length <= 32 && TRIVIAL_RE.test(t.trim())) return "trivial";
  if (config.brainMode === "max") return "complex";
  // auto mode
  if (long || multiQuestion || complexWords) return "complex";
  return "casual";
}

const TIER_SETTINGS = {
  trivial: { maxTokens: 220, temperature: 0.6, reasoningEffort: "low", evaluate: false },
  casual:  { maxTokens: 700, temperature: 0.7, reasoningEffort: config.brainMode === "auto" ? "medium" : config.reasoningEffort, evaluate: false },
  complex: { maxTokens: 1800, temperature: 0.7, reasoningEffort: config.brainMode === "auto" ? "high" : config.reasoningEffort, evaluate: config.enableEvaluation }
};

async function draft({ messages, model, settings, temperature }) {
  return chatCompletion({
    messages,
    model,
    maxTokens: settings.maxTokens,
    temperature: temperature ?? settings.temperature,
    reasoningEffort: settings.reasoningEffort,
    timeoutMs: 35000
  });
}

export async function generateReply(messages, currentText) {
  const tier = classifyTier(currentText);
  const settings = TIER_SETTINGS[tier] || TIER_SETTINGS.casual;
  // Max brain: always the strongest model. auto: strong only for complex tiers.
  const model = config.brainMode === "auto" && tier === "trivial" ? config.fastModel : config.strongModel;

  try {
    if (settings.evaluate && config.parallelDrafts) {
      // Two drafts generated IN PARALLEL (same wall-clock time as one), then judged.
      const [candidateA, candidateB] = await Promise.all([
        draft({ messages, model, settings }),
        draft({ messages, model, settings, temperature: Math.min(1, settings.temperature + 0.25) })
      ]).then(results => results.map(r => r && r.trim()));

      if (candidateA && candidateB && candidateA !== candidateB) {
        const best = await chooseBetterReply({ messages, candidateA, candidateB }).catch(() => candidateA);
        return best || candidateA;
      }
      return candidateA || candidateB || "";
    }

    const candidateA = await draft({ messages, model, settings });
    if (!candidateA) return "Sorry, I couldn't think of a reply just now.";

    if (settings.evaluate) {
      try {
        const candidateB = await draft({ messages, model, settings, temperature: 0.9 });
        if (candidateB && candidateB.trim() !== candidateA) {
          return await chooseBetterReply({ messages, candidateA, candidateB });
        }
      } catch (error) {
        console.warn("Reply evaluation failed; using first draft:", error.message);
      }
    }
    return candidateA;
  } catch (error) {
    console.error("generateReply failed:", error?.message || error);
    // Self-healing: fall back to the fast model without reasoning so a reply still arrives.
    try {
      return await chatCompletion({
        messages,
        model: config.fastModel,
        maxTokens: 400,
        temperature: 0.7,
        reasoningEffort: "low",
        timeoutMs: 20000,
        retries: 1
      });
    } catch {
      return "";
    }
  }
}
