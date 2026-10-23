import fs from "node:fs";
import { groq } from "../ai/groq.js";
import { config } from "../config/env.js";

/**
 * Transcribe audio with better accuracy than plain transcription:
 * - feeds recent chat words/names as a Whisper "prompt" so names, places and
 *   slang the people actually use get recognized (max 224 tokens per Groq docs)
 * - temperature 0 for deterministic output
 * - automatic fallback to the full whisper-large-v3 model if turbo fails
 */
export async function transcribeAudio(filePath, { contextHint = "" } = {}) {
  const prompt = contextHint ? contextHint.slice(-800) : "";
  const models = [...new Set([config.transcriptionModel, "whisper-large-v3"])];

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
        const text = result.text?.trim() || "";
        if (text) return text;
        break; // empty result: don't retry same model
      } catch (error) {
        const status = error?.status || error?.response?.status;
        console.error(`Transcription failed (${model}, attempt ${attempt + 1}):`, error.message);
        // Do not retry on auth/quota errors or invalid request — try next model instead.
        if (status === 401 || status === 403 || status === 413 || status === 400) break;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  return "";
}

/**
 * Build a short transcription prompt from recent conversation text so Whisper
 * recognizes recurring names and vocabulary of this specific chat.
 */
export function buildTranscriptionHint(recentMessages = []) {
  const words = [];
  for (const m of recentMessages.slice(-8)) {
    for (const w of String(m.content || "").split(/\s+/)) {
      if (w.length > 2 && words.length < 120) words.push(w);
    }
  }
  return words.join(" ").slice(0, 800);
}
