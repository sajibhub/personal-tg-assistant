import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  chatId: { type: String, required: true, index: true },
  messageId: { type: Number, required: true },
  senderId: { type: String, default: "" },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  isVoice: { type: Boolean, default: false },
  replyToMessageId: { type: Number, default: null },
  embedding: { type: [Number], default: undefined },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

messageSchema.index({ chatId: 1, messageId: 1, role: 1 }, { unique: true });
messageSchema.index({ chatId: 1, createdAt: -1 });

export default mongoose.models.Message || mongoose.model("Message", messageSchema);
