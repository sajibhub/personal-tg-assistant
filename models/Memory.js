import mongoose from "mongoose";

const memorySchema = new mongoose.Schema({
  chatId: { type: String, required: true, index: true },
  type: { type: String, default: "fact" },
  text: { type: String, required: true },
  importance: { type: Number, default: 5, min: 1, max: 10 },
  sourceMessageId: { type: Number, default: null },
  embedding: { type: [Number], default: undefined },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

memorySchema.index({ chatId: 1, active: 1, updatedAt: -1 });

export default mongoose.models.Memory || mongoose.model("Memory", memorySchema);
