import Groq from "groq-sdk";
import { config } from "../config/env.js";

export const groq = new Groq({ apiKey: config.groqApiKey, maxRetries: 0 });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function isRetryable(error) {
  const status = error?.status || error?.response?.status;
  if (status === 429 || status === 408) return true;
  if (status >= 500 && status < 600) return true;
  const code = error?.code || error?.cause?.code;
  return ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_HEADERS_TIMEOUT"].includes(code);
}

function retryAfterMs(error) {
  const header = error?.headers?.get?.("retry-after") || error?.response?.headers?.get?.("retry-after");
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 15000) : null;
}

/**
 * Chat completion with automatic retries, timeout and gpt-oss reasoning support.
 * reasoningEffort: "low" | "medium" | "high" | null (null disables the parameter)
 */
export async function chatCompletion({
  messages,
  model = config.fastModel,
  maxTokens = 300,
  temperature = 0.65,
  reasoningEffort = null,
  timeoutMs = 30000,
  retries = 2,
  responseFormat = null
}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const body = {
        model,
        messages,
        temperature,
        max_completion_tokens: maxTokens,
        stream: false
      };
      if (reasoningEffort) body.reasoning_effort = reasoningEffort;
      if (model.startsWith("openai/gpt-oss")) body.reasoning_format = "hidden";
      if (responseFormat) body.response_format = responseFormat;

      const response = await groq.chat.completions.create(body, {
        timeout: timeoutMs,
        signal: AbortSignal.timeout(timeoutMs)
      });
      return response.choices?.[0]?.message?.content?.trim() || "";
    } catch (error) {
      lastError = error;
      const aborted = error?.name === "AbortError" || error?.name === "TimeoutError";
      if (aborted || !isRetryable(error) || attempt === retries) break;
      await sleep(retryAfterMs(error) ?? 600 * (attempt + 1) ** 2);
    }
  }
  throw lastError;
}

/** Robust JSON object parser: handles ```json fences, leading text, nested braces. */
export function parseJsonObject(text) {
  const cleaned = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model did not return a JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}
