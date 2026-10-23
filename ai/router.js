import { chatCompletion } from "./groq.js";
import { chooseBetterReply } from "./evaluator.js";
import { config } from "../config/env.js";

function classifyComplexity(text) {
  const t = text.trim();
  const questionCount = (t.match(/\?/g) || []).length;
  const complexWords = /\b(why|explain|compare|relationship|problem|help me decide|what should|how do|because|actually|yesterday|before|remember|plan|promise|urgent|sorry|angry|sad|love|break up|technical|debug|error)\b/i.test(t);
  return t.length > 220 || questionCount > 1 || complexWords;
}

export async function generateReply(messages, currentText) {
  const complex = classifyComplexity(currentText);
  const model = complex ? config.strongModel : config.fastModel;
  const candidateA = await chatCompletion({
    model,
    messages,
    maxTokens: complex ? 360 : 160,
    temperature: 0.65
  });

  if (!candidateA) return "Sorry, I couldn't think of a reply just now.";

  // Compare only for complex messages, and only if enabled.
  if (complex && config.enableEvaluation) {
    try {
      const candidateB = await chatCompletion({
        model,
        messages,
        maxTokens: 360,
        temperature: 0.9
      });
      if (candidateB && candidateB !== candidateA) {
        return await chooseBetterReply({ messages, candidateA, candidateB });
      }
    } catch (error) {
      console.warn("Reply evaluation failed; using first draft:", error.message);
    }
  }
  return candidateA;
}
