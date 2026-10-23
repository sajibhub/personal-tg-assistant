import dotenv from "dotenv";
dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  apiId: Number(required("API_ID")),
  apiHash: required("API_HASH"),
  session: process.env.SESSION || "",
  groqApiKey: required("GROQ_API_KEY"),
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/telegram-ai-brain",
  port: Number(process.env.PORT || 3000),
  fastModel: process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b",
  strongModel: process.env.GROQ_STRONG_MODEL || "openai/gpt-oss-120b",
  transcriptionModel: process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
  recentMessages: Number(process.env.RECENT_MESSAGES || 12),
  memoryResults: Number(process.env.MEMORY_RESULTS || 6),
  extractEvery: Number(process.env.MEMORY_EXTRACT_EVERY || 4),
  enableEvaluation: (process.env.ENABLE_REPLY_EVALUATION || "true").toLowerCase() === "true",
  autoReply: (process.env.AUTO_REPLY || "true").toLowerCase() === "true",
  ignoreOldMessages: (process.env.IGNORE_OLD_MESSAGES_BEFORE_START || "true").toLowerCase() === "true"
};

if (!Number.isInteger(config.apiId) || config.apiId <= 0) {
  throw new Error("API_ID must be a positive integer");
}
