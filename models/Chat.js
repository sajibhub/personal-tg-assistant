import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  chatId: { type: String, unique: true, required: true },
  autoReply: { type: Boolean, default: true },
  summary: { type: String, default: "" },
  userMessagesSinceExtraction: { type: Number, default: 0 },
  lastHandledMessageId: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

export default mongoose.models.Chat || mongoose.model("Chat", chatSchema);
