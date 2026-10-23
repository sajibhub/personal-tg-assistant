import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema({
  chatId: { type: String, required: true, index: true },
  sourceMessageId: Number,
  generatedReply: String,
  finalReply: String,
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

export default mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);
