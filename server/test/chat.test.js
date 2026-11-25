import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import mongoose from "mongoose";
import { Conversation } from "../src/models/Conversation.js";
import { Message } from "../src/models/Message.js";
import { send, startApp, tokenCookie } from "./helper.js";

const password = "correct-horse";
let ctx;

test.before(
  async () => {
    ctx = await startApp();
  },
  { timeout: 180_000 },
);

test.after(async () => {
  await ctx?.stop();
});

function email() {
  return `${randomUUID()}@example.com`;
}

async function signup() {
  const response = await send(`${ctx.url}/auth/signup`, {
    method: "POST",
    body: { email: email(), password },
  });
  assert.equal(response.status, 201);
  return { id: response.body.id, cookie: tokenCookie(response.cookies) };
}

function oid(id) {
  return new mongoose.Types.ObjectId(id);
}

async function insertConversation(userId, { updatedAt, title = "New chat", escalation = null }) {
  const _id = new mongoose.Types.ObjectId();
  await Conversation.collection.insertOne({
    _id,
    userId: oid(userId),
    title,
    escalation,
    createdAt: updatedAt,
    updatedAt,
  });
  return _id;
}

async function insertMessage(userId, conversationId, fields) {
  const _id = new mongoose.Types.ObjectId();
  await Message.collection.insertOne({
    _id,
    conversationId,
    userId: oid(userId),
    role: fields.role,
    content: fields.content,
    incomplete: fields.incomplete ?? false,
    ...(fields.role === "assistant" ? { model: "nvidia/nemotron-3-ultra-550b-a55b:free" } : {}),
    createdAt: fields.createdAt,
  });
  return _id;
}

async function walk(path, cookie, limit, cursor) {
  const items = [];
  let pages = 0;
  let hasMore = true;
  let next = cursor;
  while (hasMore) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (next) params.set("cursor", next);
    const response = await send(`${ctx.url}${path}?${params}`, { cookie });
    assert.equal(response.status, 200, response.text);
    pages += 1;
    assert.ok(pages < 20);
    items.push(...response.body.items);
    hasMore = response.body.hasMore;
    next = response.body.nextCursor;
    if (hasMore) assert.equal(typeof next, "string");
    else assert.equal(next, null);
  }
  return { items, pages };
}

test("empty history and messages are an empty page", async () => {
  const user = await signup();
  const history = await send(`${ctx.url}/chat/history`, { cookie: user.cookie });
  assert.equal(history.status, 200);
  assert.deepEqual(history.body, { items: [], nextCursor: null, hasMore: false });

  const conversationId = await insertConversation(user.id, {
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  });
  const messages = await send(`${ctx.url}/chat/conversations/${conversationId}/messages`, {
    cookie: user.cookie,
  });
  assert.deepEqual(messages.body, { items: [], nextCursor: null, hasMore: false });
});

test("history walks every page without gaps or duplicates", async () => {
  const user = await signup();
  const base = new Date("2024-03-01T00:00:00.000Z");
  for (let i = 0; i < 7; i += 1) {
    await insertConversation(user.id, { updatedAt: new Date(base.getTime() + i * 3_600_000) });
  }
  const { items, pages } = await walk("/chat/history", user.cookie, 2);
  assert.ok(pages >= 3);
  const expected = await Conversation.find({ userId: user.id })
    .sort({ updatedAt: -1, _id: -1 })
    .lean();
  assert.deepEqual(
    items.map((item) => item.id),
    expected.map((doc) => String(doc._id)),
  );
  assert.deepEqual(Object.keys(items[0]).sort(), ["escalation", "id", "title", "updatedAt"]);
});

test("message pages walk without gaps or duplicates", async () => {
  const user = await signup();
  const conversationId = await insertConversation(user.id, {
    updatedAt: new Date("2024-03-02T00:00:00.000Z"),
  });
  const base = new Date("2024-03-02T00:00:00.000Z");
  for (let i = 0; i < 7; i += 1) {
    await insertMessage(user.id, conversationId, {
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
      createdAt: new Date(base.getTime() + i * 60_000),
    });
  }
  const { items, pages } = await walk(
    `/chat/conversations/${conversationId}/messages`,
    user.cookie,
    2,
  );
  assert.ok(pages >= 3);
  const expected = await Message.find({ conversationId }).sort({ createdAt: -1, _id: -1 }).lean();
  assert.deepEqual(
    items.map((item) => item.id),
    expected.map((doc) => String(doc._id)),
  );
  assert.deepEqual(Object.keys(items[0]).sort(), [
    "content",
    "createdAt",
    "id",
    "incomplete",
    "model",
    "role",
  ]);
});

test("identical timestamps still paginate", async () => {
  const user = await signup();
  const at = new Date("2024-04-01T00:00:00.000Z");
  for (let i = 0; i < 5; i += 1) await insertConversation(user.id, { updatedAt: at });
  const history = await walk("/chat/history", user.cookie, 2);
  assert.ok(history.pages >= 3);
  const expectedHistory = await Conversation.find({ userId: user.id })
    .sort({ updatedAt: -1, _id: -1 })
    .lean();
  assert.deepEqual(
    history.items.map((item) => item.id),
    expectedHistory.map((doc) => String(doc._id)),
  );

  const conversationId = await insertConversation(user.id, { updatedAt: at });
  for (let i = 0; i < 5; i += 1) {
    await insertMessage(user.id, conversationId, { role: "user", content: `t${i}`, createdAt: at });
  }
  const messages = await walk(`/chat/conversations/${conversationId}/messages`, user.cookie, 2);
  assert.ok(messages.pages >= 3);
  const expectedMessages = await Message.find({ conversationId })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  assert.deepEqual(
    messages.items.map((item) => item.id),
    expectedMessages.map((doc) => String(doc._id)),
  );
});

test("a newer row inserted mid-walk does not skip or repeat an older one", async () => {
  const user = await signup();
  const base = new Date("2024-05-01T00:00:00.000Z");
  for (let i = 0; i < 6; i += 1) {
    await insertConversation(user.id, { updatedAt: new Date(base.getTime() + i * 3_600_000) });
  }
  const first = await send(`${ctx.url}/chat/history?limit=2`, { cookie: user.cookie });
  assert.equal(first.status, 200);
  assert.equal(first.body.hasMore, true);
  const newer = await insertConversation(user.id, {
    updatedAt: new Date("2030-01-01T00:00:00.000Z"),
  });
  const rest = await walk("/chat/history", user.cookie, 2, first.body.nextCursor);
  const seen = [...first.body.items, ...rest.items].map((item) => item.id);
  assert.equal(seen.includes(String(newer)), false);
  assert.equal(new Set(seen).size, seen.length);
  const expected = await Conversation.find({ userId: user.id, _id: { $ne: newer } })
    .sort({ updatedAt: -1, _id: -1 })
    .lean();
  assert.deepEqual(
    seen,
    expected.map((doc) => String(doc._id)),
  );

  const conversationId = await insertConversation(user.id, { updatedAt: base });
  for (let i = 0; i < 6; i += 1) {
    await insertMessage(user.id, conversationId, {
      role: "user",
      content: `p${i}`,
      createdAt: new Date(base.getTime() + i * 60_000),
    });
  }
  const messagePath = `/chat/conversations/${conversationId}/messages`;
  const firstPage = await send(`${ctx.url}${messagePath}?limit=2`, { cookie: user.cookie });
  assert.equal(firstPage.body.hasMore, true);
  const newerMessage = await insertMessage(user.id, conversationId, {
    role: "user",
    content: "newer",
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
  });
  const older = await walk(messagePath, user.cookie, 2, firstPage.body.nextCursor);
  const messageIds = [...firstPage.body.items, ...older.items].map((item) => item.id);
  assert.equal(messageIds.includes(String(newerMessage)), false);
  assert.equal(new Set(messageIds).size, messageIds.length);
  const expectedMessages = await Message.find({
    conversationId,
    _id: { $ne: newerMessage },
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  assert.deepEqual(
    messageIds,
    expectedMessages.map((doc) => String(doc._id)),
  );
});

test("malformed cursors and limits are 400", async () => {
  const user = await signup();
  const conversationId = await insertConversation(user.id, {
    updatedAt: new Date("2024-06-01T00:00:00.000Z"),
  });
  for (const path of ["/chat/history", `/chat/conversations/${conversationId}/messages`]) {
    const cursor = await send(`${ctx.url}${path}?cursor=not-a-cursor`, { cookie: user.cookie });
    const limit = await send(`${ctx.url}${path}?limit=51`, { cookie: user.cookie });
    assert.equal(cursor.status, 400);
    assert.deepEqual(cursor.body, { error: "Invalid cursor" });
    assert.equal(limit.status, 400);
    assert.deepEqual(limit.body, { error: "Invalid query" });
  }
});

test("chat routes require auth", async () => {
  const missing = "a".repeat(24);
  const history = await send(`${ctx.url}/chat/history`);
  const messages = await send(`${ctx.url}/chat/conversations/${missing}/messages`);
  const escalate = await send(`${ctx.url}/chat/conversations/${missing}/escalate`, {
    method: "POST",
    body: { summary: "Need a person" },
  });
  const deleted = await send(`${ctx.url}/chat/conversations/${missing}`, { method: "DELETE" });
  for (const response of [history, messages, escalate, deleted]) {
    assert.equal(response.status, 401);
  }
});

test("user A cannot read, escalate, or delete user B's conversation", async () => {
  const a = await signup();
  const b = await signup();
  const conversationId = await insertConversation(b.id, {
    updatedAt: new Date("2024-07-01T00:00:00.000Z"),
  });
  await insertMessage(b.id, conversationId, {
    role: "user",
    content: "private",
    createdAt: new Date("2024-07-01T00:00:00.000Z"),
  });
  const path = `/chat/conversations/${conversationId}`;
  const messages = await send(`${ctx.url}${path}/messages`, { cookie: a.cookie });
  const escalate = await send(`${ctx.url}${path}/escalate`, {
    method: "POST",
    cookie: a.cookie,
    body: { summary: "Please look" },
  });
  const deleted = await send(`${ctx.url}${path}`, { method: "DELETE", cookie: a.cookie });
  assert.equal(messages.status, 404);
  assert.equal(escalate.status, 404);
  assert.equal(deleted.status, 404);
  assert.equal(await Conversation.countDocuments({ _id: conversationId }), 1);
  assert.equal(await Message.countDocuments({ conversationId }), 1);
  const history = await send(`${ctx.url}/chat/history`, { cookie: a.cookie });
  assert.equal(
    history.body.items.some((item) => item.id === String(conversationId)),
    false,
  );
});

test("delete removes the messages and a missing id is 404", async () => {
  const user = await signup();
  const conversationId = await insertConversation(user.id, {
    updatedAt: new Date("2024-08-01T00:00:00.000Z"),
  });
  await insertMessage(user.id, conversationId, {
    role: "user",
    content: "hello",
    createdAt: new Date("2024-08-01T00:00:00.000Z"),
  });
  const deleted = await send(`${ctx.url}/chat/conversations/${conversationId}`, {
    method: "DELETE",
    cookie: user.cookie,
  });
  assert.equal(deleted.status, 204);
  assert.equal(deleted.body, null);
  assert.equal(await Conversation.countDocuments({ _id: conversationId }), 0);
  assert.equal(await Message.countDocuments({ conversationId }), 0);
  const again = await send(`${ctx.url}/chat/conversations/${conversationId}`, {
    method: "DELETE",
    cookie: user.cookie,
  });
  assert.equal(again.status, 404);
  const missing = await send(`${ctx.url}/chat/conversations/not-an-id/messages`, {
    cookie: user.cookie,
  });
  assert.equal(missing.status, 404);
});

test("escalate validates the summary and rejects a second call", async () => {
  const user = await signup();
  const conversationId = await insertConversation(user.id, {
    updatedAt: new Date("2024-09-01T00:00:00.000Z"),
  });
  const path = `${ctx.url}/chat/conversations/${conversationId}/escalate`;
  for (const summary of ["", "   ", "x".repeat(501)]) {
    const response = await send(path, { method: "POST", cookie: user.cookie, body: { summary } });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Summary must be 1 to 500 characters");
  }
  const missing = await send(`${ctx.url}/chat/conversations/${"b".repeat(24)}/escalate`, {
    method: "POST",
    cookie: user.cookie,
    body: { summary: "Please take this" },
  });
  assert.equal(missing.status, 404);

  const created = await send(path, {
    method: "POST",
    cookie: user.cookie,
    body: { summary: "  Friday payout still missing.  " },
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.escalation.summary, "Friday payout still missing.");
  const again = await send(path, {
    method: "POST",
    cookie: user.cookie,
    body: { summary: "Again" },
  });
  assert.equal(again.status, 400);
  assert.deepEqual(again.body, { error: "Already escalated" });
});
