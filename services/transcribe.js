import fs from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { groq } from "../ai/groq.js";
import { config } from "../config/env.js";

function getStatus(error) {
  return error?.status ?? error?.response?.status ?? 0;
}

function getRetryDelay(error, attempt) {
  const raw =
    error?.headers?.["retry-after"] ??
    error?.response?.headers?.["retry-after"];

  const seconds = Number(raw);

  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 15000);
  }

  return 1000 * (attempt + 1);
}

function isRetryable(error) {
  const status = getStatus(error);

  return (
    status === 0 ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500
  );
}

function isPermanentError(error) {
  return [400, 401, 403, 413, 415, 422].includes(
    getStatus(error)
  );
}

function getErrorMessage(error) {
  return String(error?.message || error || "Unknown error").slice(0, 500);
}

export async function transcribeAudio(
  filePath,
  { contextHint = "" } = {}
) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);

    const stat = await fs.promises.stat(filePath);

    if (!stat.isFile() || stat.size === 0) {
      console.error("Transcription: audio file is empty or invalid.");
      return "";
    }

    // Groq's transcription upload limit depends on its current API rules.
    // Reject obviously oversized files rather than uploading them.
    if (stat.size > 25 * 1024 * 1024) {
      console.error("Transcription: audio exceeds the 25 MB limit.");
      return "";
    }
  } catch (error) {
    console.error("Transcription: cannot read audio file:", getErrorMessage(error));
    return "";
  }

  const prompt = String(contextHint || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-500);

  const models = [
    ...new Set(
      [
        config.transcriptionModel || "whisper-large-v3-turbo",
        "whisper-large-v3"
      ].filter(Boolean)
    )
  ];

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(
          `Transcription starting: model=${model}, attempt=${attempt + 1}, bytes=${(await fs.promises.stat(filePath)).size}`
        );

        const result = await groq.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model,
          response_format: "json",
          temperature: 0,
          ...(prompt ? { prompt } : {})
        });

        const text = String(result?.text || "").trim();

        if (text) {
          console.log(
            `Transcription successful: model=${model}, characters=${text.length}`
          );

          return text;
        }

        console.warn(`Transcription returned empty text: model=${model}`);
        break;
      } catch (error) {
        const status = getStatus(error);

        console.error("Transcription request failed:", {
          model,
          attempt: attempt + 1,
          status,
          message: getErrorMessage(error)
        });

        if (isPermanentError(error)) {
          break;
        }

        if (!isRetryable(error) || attempt === 1) {
          break;
        }

        await sleep(getRetryDelay(error, attempt));
      }
    }
  }

  console.error(
    "Transcription failed: all configured models were unsuccessful."
  );

  return "";
}

export function buildTranscriptionHint(recentMessages = []) {
  return recentMessages
    .slice(-8)
    .map(message =>
      String(message.content || "").replace(/\s+/g, " ").trim()
    )
    .filter(Boolean)
    .join(" ")
    .slice(-500);
}