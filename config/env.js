import dotenv from "dotenv";
dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const flag = (name, fallback = "true") => (process.env[name] || fallback).toLowerCase() === "true";

export const config = {
  // Telegram
  apiId: Number(required("API_ID")),
  apiHash: required("API_HASH"),
  session: process.env.SESSION || "",
  port: Number(process.env.PORT || 3000),

  // Groq keys/models
  groqApiKey: required("GROQ_API_KEY"),
  mongoUri: required("MONGO_URI"),
  fastModel: process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b",
  strongModel: process.env.GROQ_STRONG_MODEL || "openai/gpt-oss-120b",
  transcriptionModel: process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
  ttsModel: process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english",
  ttsVoice: process.env.GROQ_TTS_VOICE || "autumn",

  // Brain power
  brainMode: (process.env.BRAIN_MODE || "max").toLowerCase(),          // max | auto | fast
  reasoningEffort: (process.env.REASONING_EFFORT || "high").toLowerCase(),
  enableEvaluation: flag("ENABLE_REPLY_EVALUATION"),
  parallelDrafts: flag("PARALLEL_DRAFTS"),
  enableQueryRewrite: flag("ENABLE_QUERY_REWRITE"),
  enableTyping: flag("ENABLE_TYPING"),

  // Voice
  voiceReplies: flag("VOICE_REPLIES"),
  ttsMaxChars: Number(process.env.TTS_MAX_CHARS || 700),

  // Memory
  recentMessages: Number(process.env.RECENT_MESSAGES || 12),
  memoryResults: Number(process.env.MEMORY_RESULTS || 6),
  extractEvery: Number(process.env.MEMORY_EXTRACT_EVERY || 4),
  summaryEvery: Number(process.env.SUMMARY_EVERY || 30),
  embedCacheSize: Number(process.env.EMBED_CACHE_SIZE || 500),

  // Misc
  autoReply: flag("AUTO_REPLY"),
  timezone: process.env.TIMEZONE || "Asia/Dhaka",
  ignoreOldMessages: flag("IGNORE_OLD_MESSAGES_BEFORE_START")
};

if (!Number.isInteger(config.apiId) || config.apiId <= 0) {
  throw new Error("API_ID must be a positive integer");
}
if (!["max", "auto", "fast"].includes(config.brainMode)) {
  throw new Error("BRAIN_MODE must be one of: max, auto, fast");
}
