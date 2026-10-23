import { chatCompletion } from "./groq.js";
import { config } from "../config/env.js";

export async function chooseBetterReply({ messages, candidateA, candidateB }) {
  const prompt = `Pick the better draft for this conversation. Prioritize accuracy, relevance, natural tone, language match, brevity, and not inventing facts. Return only the chosen reply, with no explanation.\n\nDraft A:\n${candidateA}\n\nDraft B:\n${candidateB}`;
  const chosen = await chatCompletion({
    model: config.strongModel,
    maxTokens: 220,
    temperature: 0.1,
    messages: [
      ...messages.slice(0, -1),
      { role: "user", content: `${messages.at(-1)?.content || ""}\n\n${prompt}` }
    ]
  });
  return chosen || candidateA;
}
