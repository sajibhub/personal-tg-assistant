import Groq from "groq-sdk";
import { config } from "../config/env.js";

export const groq = new Groq({ apiKey: config.groqApiKey });

export async function chatCompletion({ messages, model = config.fastModel, maxTokens = 220, temperature = 0.65 }) {
  const response = await groq.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false
  });
  return response.choices?.[0]?.message?.content?.trim() || "";
}

export function parseJsonObject(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model did not return a JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}
