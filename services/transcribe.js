import fs from "node:fs";
import { groq } from "../ai/groq.js";
import { config } from "../config/env.js";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getStatus(error) {
  return error?.status ?? error?.response?.status ?? 0;
}

function isRetryable(error) {
  const status = getStatus(error);

  return (
    status === 429 ||
    status >= 500 ||
    status === 408 ||
    status === 0
  );
}

/**
 * Transcribe Telegram voice messages.
 * Tries the configured model first, then Whisper Large V3.
 */
export async function transcribeAudio(filePath, { contextHint = "" } = {}) {
  if (!fs.existsSync(filePath)) {
    console.error("Transcription error: audio file does not exist.");
    return "";
  }

  const prompt = String(contextHint || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-500);

  const models = [
    ...new Set([
      config.transcriptionModel,
      "whisper-large-v3"
    ].filter(Boolean))
  ];

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await groq.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model,
          response_format: "json",
          temperature: 0,
          ...(prompt ? { prompt } : {})
        });

        const text = result?.text?.trim() || "";

        if (text) {
          return text;
        }

        console.warn(`Empty transcription from ${model}.`);
        break;
      } catch (error) {
        const status = getStatus(error);

        console.error(
          `Transcription failed: model=${model}, attempt=${attempt + 1}, status=${status}, error=${error.message}`
        );

        // Authentication, invalid request, and oversized audio
        // should not be retried.
        if (
          [400, 401, 403, 413, 415, 422].includes(status)
        ) {
          break;
        }

        if (!isRetryable(error) || attempt === 1) {
          break;
        }

        // Respect a provided Retry-After value when available.
        const retryAfter = Number(
          error?.headers?.["retry-after"] ??
          error?.response?.headers?.["retry-after"]
        );

        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 15000)
          : 1000 * (attempt + 1);

        await sleep(delay);
      }
    }
  }

  return "";
}

/**
 * Build a short vocabulary hint from recent conversation messages.
 */
export function buildTranscriptionHint(recentMessages = []) {
  const words = [];

  for (const message of recentMessages.slice(-8)) {
    const content = String(message.content || "")
      .replace(/\s+/g, " ")
      .trim();

    if (content) {
      words.push(content);
    }
  }

  return words.join(" ").slice(-500);
}