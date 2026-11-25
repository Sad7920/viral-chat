import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { models } from "../allowlist.js";
import { decodeCursor, encodeCursor } from "../cursor.js";
import { requireAuth } from "../middleware/auth.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { RATE_LIMIT_MESSAGE } from "../openrouter.js";
import { systemPrompt, titleInstruction } from "../persona.js";
import { endSse, openSse, writeEvent } from "../sse.js";

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

const sendBody = z.object({
  conversationId: z.union([z.string(), z.null()]),
  content: z.string().trim().min(1).max(4000),
  model: z.string().min(1).optional(),
});

const CONTEXT_LIMIT = 20;
const NEW_CHAT = "New chat";
const TITLE_LIMIT = 48;
const TITLE_TOKENS = 30;

function allowedModel(id) {
  return typeof id === "string" && models.some((model) => model.id === id);
}

function clientMessage(err) {
  if (err?.status === 429) return RATE_LIMIT_MESSAGE;
  if (typeof err?.message === "string" && err.message.trim())
    return err.message.trim().slice(0, 300);
  return "The model request failed";
}

function buildContext(chronological) {
  return [
    { role: "system", content: systemPrompt },
    ...chronological.slice(-CONTEXT_LIMIT).map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

async function loadContext(conversationId, userId) {
  const docs = await Message.find({ conversationId, userId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(CONTEXT_LIMIT)
    .select({ role: 1, content: 1 })
    .lean();
  docs.reverse();
  return buildContext(docs);
}

async function runTurn(req, res, openrouter, conversation, model) {
  const upstream = new AbortController();
  let clientGone = false;
  // req "close" fires when the body has been read, which is not a disconnect.
  res.on("close", () => {
    if (!res.writableFinished) {
      clientGone = true;
      upstream.abort();
    }
  });

  await Conversation.updateOne(
    { _id: conversation._id, userId: req.userId },
    { $set: { updatedAt: new Date() } },
  );
  const context = await loadContext(conversation._id, req.userId);
  const gen = openrouter.streamCompletion({ model, messages: context, signal: upstream.signal });
  let sseOpen = false;
  let text = "";

  function open() {
    if (sseOpen) return;
    sseOpen = true;
    openSse(res);
    writeEvent(res, "meta", { conversationId: String(conversation._id) });
  }

  async function saveAssistant(content, incomplete) {
    const message = await Message.create({
      conversationId: conversation._id,
      userId: req.userId,
      role: "assistant",
      content,
      model,
      incomplete,
    });
    await Conversation.updateOne(
      { _id: conversation._id, userId: req.userId },
      { $set: { updatedAt: new Date() } },
    );
    return message;
  }

  async function publishTitle() {
    if (conversation.title !== NEW_CHAT) return;
    const owned = { conversationId: conversation._id, userId: req.userId };
    const [userMessage, assistantMessage] = await Promise.all([
      Message.findOne({ ...owned, role: "user" }).sort({ createdAt: 1, _id: 1 }),
      Message.findOne({ ...owned, role: "assistant" }).sort({ createdAt: 1, _id: 1 }),
    ]);
    if (!userMessage) return;
    const fallback = userMessage.content.slice(0, TITLE_LIMIT);
    let title = fallback;
    if (assistantMessage && !assistantMessage.incomplete) {
      try {
        const raw = await openrouter.completeOnce({
          model,
          maxTokens: TITLE_TOKENS,
          messages: [
            { role: "system", content: titleInstruction },
            { role: "user", content: userMessage.content },
            { role: "assistant", content: assistantMessage.content },
          ],
        });
        title = typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
      } catch {
        title = fallback;
      }
    }
    if (!title) return;
    const updated = await Conversation.updateOne(
      { _id: conversation._id, userId: req.userId, title: NEW_CHAT },
      { $set: { title, updatedAt: new Date() } },
    );
    if (updated.matchedCount === 0) return;
    conversation.title = title;
    if (!clientGone && sseOpen) writeEvent(res, "title", { title });
  }

  async function stopEarly() {
    if (text) {
      await saveAssistant(text, true);
      await publishTitle();
    }
    if (sseOpen) endSse(res);
  }

  async function handleFailure(err) {
    const aborted = clientGone || upstream.signal.aborted || err?.name === "AbortError";
    if (aborted) {
      await stopEarly();
      return;
    }
    if (!sseOpen && (err?.beforeStream === true || err?.status === 429)) {
      if (err.status === 429) res.status(429).json({ error: RATE_LIMIT_MESSAGE });
      else res.status(502).json({ error: clientMessage(err) });
      return;
    }
    if (!sseOpen) open();
    if (text) await saveAssistant(text, true);
    writeEvent(res, "error", { message: clientMessage(err) });
    if (text) await publishTitle();
    endSse(res);
  }

  let step;
  try {
    step = await gen.next();
    while (!step.done) {
      if (clientGone || upstream.signal.aborted) break;
      const delta = step.value;
      if (typeof delta === "string" && delta.length > 0) {
        if (!sseOpen) open();
        text += delta;
        writeEvent(res, "token", { text: delta });
      }
      step = await gen.next();
    }
  } catch (err) {
    await handleFailure(err);
    return;
  }

  if (clientGone || upstream.signal.aborted) {
    if (!step.done) await gen.return();
    await stopEarly();
    return;
  }

  if (!sseOpen) open();
  const assistant = await saveAssistant(text, false);
  writeEvent(res, "done", { messageId: String(assistant._id), incomplete: false });
  await publishTitle();
  endSse(res);
}

async function postSend(req, res, env, openrouter) {
  const parsed = sendBody.safeParse(req.body);
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
    const error = fields.has("content")
      ? "Message must be 1 to 4000 characters"
      : "Invalid message";
    res.status(400).json({ error });
    return;
  }
  let model = env.OPENROUTER_MODEL;
  if (parsed.data.model !== undefined) {
    if (!allowedModel(parsed.data.model)) {
      res.status(400).json({ error: "Unknown model" });
      return;
    }
    model = parsed.data.model;
  }
  let conversation;
  if (parsed.data.conversationId === null) {
    conversation = await Conversation.create({ userId: req.userId, title: NEW_CHAT });
  } else {
    const id = idSchema.safeParse(parsed.data.conversationId);
    if (!id.success) {
      notFound(res);
      return;
    }
    conversation = await Conversation.findOne({ _id: id.data, userId: req.userId });
    if (!conversation) {
      notFound(res);
      return;
    }
  }
  await Message.create({
    conversationId: conversation._id,
    userId: req.userId,
    role: "user",
    content: parsed.data.content,
    incomplete: false,
  });
  await runTurn(req, res, openrouter, conversation, model);
}

async function postRetry(req, res, env, openrouter) {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    notFound(res);
    return;
  }
  const conversation = await Conversation.findOne({ _id: id.data, userId: req.userId });
  if (!conversation) {
    notFound(res);
    return;
  }
  const last = await Message.findOne({
    conversationId: conversation._id,
    userId: req.userId,
  }).sort({ createdAt: -1, _id: -1 });
  if (!last || (last.role === "assistant" && !last.incomplete)) {
    res.status(400).json({ error: "Nothing to retry" });
    return;
  }
  let model = env.OPENROUTER_MODEL;
  if (last.role === "assistant") {
    if (allowedModel(last.model)) model = last.model;
    await Message.deleteOne({
      _id: last._id,
      conversationId: conversation._id,
      userId: req.userId,
    });
  }
  const userMessage = await Message.exists({
    conversationId: conversation._id,
    userId: req.userId,
    role: "user",
  });
  if (!userMessage) {
    res.status(400).json({ error: "Nothing to retry" });
    return;
  }
  await runTurn(req, res, openrouter, conversation, model);
}

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

export function chatRouter(env, openrouter, chatLimiter) {
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

  router.post("/send", chatLimiter, async (req, res, next) => {
    try {
      await postSend(req, res, env, openrouter);
    } catch (err) {
      if (res.headersSent) {
        console.error(err);
        endSse(res);
        return;
      }
      next(err);
    }
  });

  router.post("/conversations/:id/retry", chatLimiter, async (req, res, next) => {
    try {
      await postRetry(req, res, env, openrouter);
    } catch (err) {
      if (res.headersSent) {
        console.error(err);
        endSse(res);
        return;
      }
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
