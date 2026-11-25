import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { decodeCursor, encodeCursor } from "../cursor.js";
import { requireAuth } from "../middleware/auth.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";

const idSchema = z.string().regex(/^[a-f\d]{24}$/i);

function pageSchema(defaultLimit) {
  return z.object({
    limit: z.coerce.number().int().min(1).max(50).default(defaultLimit),
    cursor: z.string().optional(),
  });
}

const historyQuery = pageSchema(20);
const messageQuery = pageSchema(30);

const escalateBody = z.object({
  summary: z.string().trim().min(1).max(500),
});

function notFound(res) {
  res.status(404).json({ error: "Not found" });
}

function olderThan(field, cursor) {
  const at = cursor.t;
  const id = new mongoose.Types.ObjectId(cursor.id);
  return { $or: [{ [field]: { $lt: at } }, { [field]: at, _id: { $lt: id } }] };
}

function readCursor(raw) {
  if (!raw) return { cursor: null };
  const cursor = decodeCursor(raw);
  if (!cursor) return { error: "Invalid cursor" };
  return { cursor };
}

async function loadPage(model, filter, sort, limit) {
  const docs = await model
    .find(filter)
    .sort(sort)
    .limit(limit + 1)
    .lean();
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  return { page, hasMore, last: page.at(-1) };
}

function historyItem(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    escalation: doc.escalation
      ? { summary: doc.escalation.summary, createdAt: doc.escalation.createdAt }
      : null,
    updatedAt: doc.updatedAt,
  };
}

function messageItem(doc) {
  return {
    id: String(doc._id),
    role: doc.role,
    content: doc.content,
    model: doc.model ?? null,
    incomplete: doc.incomplete,
    createdAt: doc.createdAt,
  };
}

function pageBody(page, hasMore, last, timeField) {
  return {
    items: page,
    nextCursor: hasMore && last ? encodeCursor(last[timeField], last._id) : null,
    hasMore,
  };
}

export function chatRouter(env) {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/history", async (req, res, next) => {
    const parsed = historyQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const cursor = readCursor(parsed.data.cursor);
    if (cursor.error) {
      res.status(400).json({ error: cursor.error });
      return;
    }
    try {
      const { page, hasMore, last } = await loadPage(
        Conversation,
        { userId: req.userId, ...(cursor.cursor ? olderThan("updatedAt", cursor.cursor) : {}) },
        { updatedAt: -1, _id: -1 },
        parsed.data.limit,
      );
      res.json(pageBody(page.map(historyItem), hasMore, last, "updatedAt"));
    } catch (err) {
      next(err);
    }
  });

  router.get("/conversations/:id/messages", async (req, res, next) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      notFound(res);
      return;
    }
    const parsed = messageQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const cursor = readCursor(parsed.data.cursor);
    if (cursor.error) {
      res.status(400).json({ error: cursor.error });
      return;
    }
    try {
      const conversation = await Conversation.findOne({
        _id: id.data,
        userId: req.userId,
      })
        .select("_id")
        .lean();
      if (!conversation) {
        notFound(res);
        return;
      }
      const { page, hasMore, last } = await loadPage(
        Message,
        {
          conversationId: conversation._id,
          userId: req.userId,
          ...(cursor.cursor ? olderThan("createdAt", cursor.cursor) : {}),
        },
        { createdAt: -1, _id: -1 },
        parsed.data.limit,
      );
      res.json(pageBody(page.map(messageItem), hasMore, last, "createdAt"));
    } catch (err) {
      next(err);
    }
  });

  router.post("/conversations/:id/escalate", async (req, res, next) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      notFound(res);
      return;
    }
    const body = escalateBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Summary must be 1 to 500 characters" });
      return;
    }
    try {
      const conversation = await Conversation.findOne({ _id: id.data, userId: req.userId });
      if (!conversation) {
        notFound(res);
        return;
      }
      if (conversation.escalation) {
        res.status(400).json({ error: "Already escalated" });
        return;
      }
      conversation.escalation = { summary: body.data.summary, createdAt: new Date() };
      await conversation.save();
      res.json(historyItem(conversation));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/conversations/:id", async (req, res, next) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      notFound(res);
      return;
    }
    try {
      const conversation = await Conversation.findOne({ _id: id.data, userId: req.userId });
      if (!conversation) {
        notFound(res);
        return;
      }
      await Message.deleteMany({ conversationId: conversation._id, userId: req.userId });
      await Conversation.deleteOne({ _id: conversation._id, userId: req.userId });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
