import mongoose from "mongoose";

const escalationSchema = new mongoose.Schema(
  {
    summary: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, default: "New chat" },
    escalation: { type: escalationSchema, default: null },
  },
  { timestamps: true },
);

conversationSchema.index({ userId: 1, updatedAt: -1, _id: -1 });

export const Conversation = mongoose.model("Conversation", conversationSchema);
