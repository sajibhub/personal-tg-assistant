import { spawn } from "node:child_process";
import { groq } from "../ai/groq.js";
import { config } from "../config/env.js";

/**
 * Voice-reply pipeline: reply text -> Groq PlayAI TTS -> WAV -> (optional ffmpeg)
 * -> OGG/Opus voice note for Telegram.
 * Safety gates keep it sensible: language support, length, links/code blocks.
 */

// playai-tts speaks English & Spanish only. Anything with heavy non-Latin
// scripts (Bengali, Arabic, CJK, Cyrillic, Devanagari...) falls back to text.
const SPEAKABLE_RE = /^[\sA-Za-z\u00C0-\u024F0-9.,!?;:'"()\[\]{}\-–—&%$@#*+=/\\<>~^_|¡¿“”‘’…°·]+$/;

export function isSpeakable(text) {
  const t = String(text || "").trim();
  if (!t || t.length > config.ttsMaxChars) return false;
  if (/https?:\/\/|www\.|```|t\.me\//i.test(t)) return false;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters < 3) return false;
  return SPEAKABLE_RE.test(t);
}

/** Convert reply text into raw WAV audio via Groq TTS. */
export async function synthesizeSpeech(text) {
  const input = String(text).trim().slice(0, config.ttsMaxChars);
  const response = await groq.audio.speech.create({
    model: config.ttsModel,
    voice: config.ttsVoice,
    input,
    response_format: "wav"
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("TTS returned empty audio");
  return buffer;
}

/** Parse WAV header to get duration in whole seconds (for the voice bubble). */
export function wavDurationSeconds(buffer) {
  try {
    if (!buffer || buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") return 0;
    let offset = 12;
    let sampleRate = 0;
    let byteRate = 0;
    let dataSize = 0;
    while (offset + 8 <= buffer.length) {
      const id = buffer.toString("ascii", offset, offset + 4);
      const size = buffer.readUInt32LE(offset + 4);
      if (id === "fmt ") {
        sampleRate = buffer.readUInt32LE(offset + 12);
        byteRate = buffer.readUInt32LE(offset + 16);
      } else if (id === "data") {
        dataSize = Math.min(size, buffer.length - offset - 8);
        break;
      }
      offset += 8 + size + (size % 2);
    }
    return sampleRate && byteRate && dataSize ? Math.max(1, Math.round(dataSize / byteRate)) : 0;
  } catch {
    return 0;
  }
}

let ffmpegChecked = null;

async function hasFfmpeg() {
  if (ffmpegChecked !== null) return ffmpegChecked;
  ffmpegChecked = await new Promise(resolve => {
    try {
      const probe = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
      probe.on("error", () => resolve(false));
      probe.on("close", code => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
  return ffmpegChecked;
}

/** Convert WAV buffer to OGG/Opus (Telegram's native voice format) if ffmpeg exists. */
export async function convertToOggOpus(wavBuffer, timeoutMs = 30000) {
  if (!(await hasFfmpeg())) return null;
  return new Promise(resolve => {
    let settled = false;
    const done = value => { if (!settled) { settled = true; resolve(value); } };

    try {
      const proc = spawn(
        "ffmpeg",
        ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-f", "ogg", "pipe:1"],
        { stdio: ["pipe", "pipe", "ignore"] }
      );
      const chunks = [];
      proc.stdout.on("data", chunk => chunks.push(chunk));
      proc.stdin.on("error", () => {});
      proc.on("error", () => done(null));
      proc.on("close", code => done(code === 0 ? Buffer.concat(chunks) : null));
      proc.stdin.end(wavBuffer);
      setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} done(null); }, timeoutMs);
    } catch {
      done(null);
    }
  });
}
