import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import mongoose from "mongoose";
import { models } from "../src/allowlist.js";
import { Conversation } from "../src/models/Conversation.js";
import { Message } from "../src/models/Message.js";
import { RATE_LIMIT_MESSAGE } from "../src/openrouter.js";
import { systemPrompt, titleInstruction } from "../src/persona.js";
import { send, startApp, tokenCookie } from "./helper.js";

const password = "correct-horse";

function waitForAbort(signal) {
  return new Promise((resolve) => {
    if (!signal || signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 4000);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function parseEvents(raw) {
  const events = [];
  for (const block of raw.split(/\n\n/)) {
    let name = "";
    const data = [];
    for (const line of block.split(/\n/)) {
      const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
      if (trimmed.startsWith("event:")) name = trimmed.slice(6).trim();
      if (trimmed.startsWith("data:")) data.push(trimmed.slice(5).trim());
    }
    if (!name || data.length === 0) continue;
    try {
      events.push({ event: name, data: JSON.parse(data.join("\n")) });
    } catch {
      // A disconnect can cut the last block in half.
    }
  }
  return events;
}

test.describe("send and retry", { concurrency: false }, () => {
  const calls = [];
  const handlers = {
    async *stream() {
      yield "ok";
    },
    async title() {
      return "Title";
    },
  };
  const openrouter = {
    async *streamCompletion({ model, messages, signal }) {
      calls.push({
        kind: "stream",
        model,
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
      });
      const produced = handlers.stream({ model, messages, signal });
      if (produced?.[Symbol.asyncIterator]) {
        yield* produced;
        return;
      }
      await produced;
    },
    async completeOnce(args) {
      calls.push({
        kind: "title",
        model: args.model,
        maxTokens: args.maxTokens,
        messages: args.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
      return handlers.title(args);
    },
  };

  let ctx;

  test.before(
    async () => {
      ctx = await startApp({ openrouter });
    },
    { timeout: 180_000 },
  );

  test.after(async () => {
    await ctx?.stop();
  });

  test.beforeEach(() => {
    calls.length = 0;
    handlers.stream = async function* stream() {
      yield "ok";
    };
    handlers.title = async () => "Title";
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

  async function postStream(path, cookie, body, { signal, until } = {}) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${ctx.url}${path}`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/event-stream")) {
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        events: [],
        body: text ? JSON.parse(text) : null,
        raw: text,
      };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        if (until?.(raw)) break;
      }
    } catch (err) {
      if (err?.name !== "AbortError") throw err;
    } finally {
      reader.cancel().catch(() => {});
    }
    raw += decoder.decode();
    return {
      status: response.status,
      headers: response.headers,
      events: parseEvents(raw),
      body: null,
      raw,
    };
  }

  async function waitFor(read) {
    const start = Date.now();
    let value;
    while (Date.now() - start < 2000) {
      value = await read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return value;
  }

  async function insertConversation(userId, title) {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();
    await Conversation.collection.insertOne({
      _id,
      userId: new mongoose.Types.ObjectId(userId),
      title,
      escalation: null,
      createdAt: now,
      updatedAt: now,
    });
    return _id;
  }

  async function insertMessage(userId, conversationId, fields) {
    const _id = new mongoose.Types.ObjectId();
    await Message.collection.insertOne({
      _id,
      conversationId,
      userId: new mongoose.Types.ObjectId(userId),
      role: fields.role,
      content: fields.content,
      incomplete: fields.incomplete ?? false,
      ...(fields.model ? { model: fields.model } : {}),
      createdAt: fields.createdAt,
    });
    return _id;
  }

  function streamCalls() {
    return calls.filter((call) => call.kind === "stream");
  }

  function titleCalls() {
    return calls.filter((call) => call.kind === "title");
  }

  test("events arrive as meta, tokens, done, then title", async () => {
    handlers.stream = async function* stream({ messages }) {
      if (messages.at(-1).content === "first") {
        yield "Hello";
        yield " there";
        return;
      }
      yield "Second";
    };
    handlers.title = async () => "Payout timing";
    const user = await signup();
    const first = await postStream("/chat/send", user.cookie, {
      conversationId: null,
      content: "first",
    });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("content-type"), "text/event-stream");
    assert.equal(first.headers.get("cache-control"), "no-cache, no-transform");
    assert.equal(first.headers.get("x-accel-buffering"), "no");
    assert.deepEqual(
      first.events.map((event) => event.event),
      ["meta", "token", "token", "done", "title"],
    );
    assert.equal(first.events[1].data.text, "Hello");
    assert.equal(first.events[2].data.text, " there");
    assert.equal(first.events[3].data.incomplete, false);
    assert.equal(first.events[4].data.title, "Payout timing");

    const conversationId = first.events[0].data.conversationId;
    const assistant = await Message.findOne({ conversationId, role: "assistant" }).lean();
    assert.equal(assistant.content, "Hello there");
    assert.equal(assistant.incomplete, false);
    assert.equal(assistant.model, ctx.env.OPENROUTER_MODEL);
    assert.equal(first.events[3].data.messageId, String(assistant._id));
    const conversation = await Conversation.findById(conversationId).lean();
    assert.equal(conversation.title, "Payout timing");

    const title = titleCalls()[0];
    assert.equal(titleCalls().length, 1);
    assert.equal(title.maxTokens, 30);
    assert.equal(title.model, ctx.env.OPENROUTER_MODEL);
    assert.deepEqual(title.messages, [
      { role: "system", content: titleInstruction },
      { role: "user", content: "first" },
      { role: "assistant", content: "Hello there" },
    ]);
    assert.equal(JSON.stringify(title.messages).includes(systemPrompt), false);

    const second = await postStream("/chat/send", user.cookie, {
      conversationId,
      content: "second",
    });
    assert.deepEqual(
      second.events.map((event) => event.event),
      ["meta", "token", "done"],
    );
    assert.equal(titleCalls().length, 1);
    const renamed = await Conversation.findById(conversationId).lean();
    assert.equal(renamed.title, "Payout timing");
  });

  test("context starts with the system prompt, omits it from storage, and stays chronological when trimmed", async () => {
    handlers.stream = async function* stream() {
      yield "two";
    };
    handlers.title = async () => "One title";
    const user = await signup();
    const first = await postStream("/chat/send", user.cookie, {
      conversationId: null,
      content: "one",
    });
    const conversationId = first.events[0].data.conversationId;
    assert.deepEqual(streamCalls()[0].messages, [
      { role: "system", content: systemPrompt },
      { role: "user", content: "one" },
    ]);

    await postStream("/chat/send", user.cookie, { conversationId, content: "three" });
    assert.deepEqual(streamCalls()[1].messages, [
      { role: "system", content: systemPrompt },
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
    ]);

    const stored = await Message.find({ userId: user.id }).lean();
    assert.ok(stored.length >= 4);
    assert.equal(
      stored.some((message) => message.role === "system" || message.content.includes(systemPrompt)),
      false,
    );

    const seededId = await insertConversation(user.id, "Already named");
    const contents = Array.from(
      { length: 25 },
      (_unused, index) => `m${String(index).padStart(2, "0")}`,
    );
    const base = Date.parse("2024-06-01T00:00:00.000Z");
    for (let index = 0; index < contents.length; index += 1) {
      await insertMessage(user.id, seededId, {
        role: index % 2 === 0 ? "user" : "assistant",
        content: contents[index],
        createdAt: new Date(base + index * 1000),
        ...(index % 2 === 1 ? { model: models[0].id } : {}),
      });
    }
    await postStream("/chat/send", user.cookie, {
      conversationId: String(seededId),
      content: "newest",
    });
    const trimmed = streamCalls().find((call) => call.messages.at(-1)?.content === "newest");
    assert.equal(trimmed.messages[0].role, "system");
    assert.equal(trimmed.messages[0].content, systemPrompt);
    assert.deepEqual(
      trimmed.messages.slice(1).map((message) => message.content),
      [...contents.slice(6), "newest"],
    );
    assert.equal(trimmed.messages.length, 21);
  });

  test("failure before the first token emits an error and keeps only the user message", async () => {
    handlers.stream = async function stream() {
      throw new Error("model unavailable");
    };
    const user = await signup();
    const result = await postStream("/chat/send", user.cookie, {
      conversationId: null,
      content: "hello",
    });
    assert.equal(result.status, 200);
    assert.deepEqual(
      result.events.map((event) => event.event),
      ["meta", "error"],
    );
    assert.equal(result.events[1].data.message, "model unavailable");
    const conversationId = result.events[0].data.conversationId;
    const messages = await Message.find({ conversationId }).lean();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[0].content, "hello");
    const conversation = await Conversation.findById(conversationId).lean();
    assert.equal(conversation.title, "New chat");
    assert.equal(titleCalls().length, 0);
  });

  test("failure mid-stream saves a partial and then emits an error", async () => {
    handlers.stream = async function* stream() {
      yield "Partial";
      throw new Error("cut off");
    };
    const content = "x".repeat(60);
    const user = await signup();
    const result = await postStream("/chat/send", user.cookie, { conversationId: null, content });
    assert.deepEqual(
      result.events.map((event) => event.event),
      ["meta", "token", "error", "title"],
    );
    assert.equal(result.events[1].data.text, "Partial");
    assert.equal(result.events[2].data.message, "cut off");
    assert.equal(result.events[3].data.title, content.slice(0, 48));
    const conversationId = result.events[0].data.conversationId;
    const assistant = await Message.findOne({ conversationId, role: "assistant" }).lean();
    assert.equal(assistant.content, "Partial");
    assert.equal(assistant.incomplete, true);
    const conversation = await Conversation.findById(conversationId).lean();
    assert.equal(conversation.title, content.slice(0, 48));
    assert.equal(titleCalls().length, 0);
  });

  test("client abort saves the partial", async () => {
    handlers.stream = async function* stream({ signal }) {
      yield "Hello";
      yield " world";
      await waitForAbort(signal);
    };
    const user = await signup();
    const controller = new AbortController();
    const result = await postStream(
      "/chat/send",
      user.cookie,
      { conversationId: null, content: "Stop this reply" },
      {
        signal: controller.signal,
        until(raw) {
          if (!raw.includes("world")) return false;
          controller.abort();
          return true;
        },
      },
    );
    const conversationId = result.raw.match(/"conversationId":"([a-f\d]{24})"/i)?.[1];
    assert.ok(conversationId, result.raw);
    const assistant = await waitFor(() =>
      Message.findOne({ conversationId, role: "assistant", incomplete: true }).lean(),
    );
    assert.ok(assistant);
    assert.equal(assistant.content, "Hello world");
    const users = await Message.countDocuments({ conversationId, role: "user" });
    assert.equal(users, 1);
    const conversation = await waitFor(async () => {
      const doc = await Conversation.findById(conversationId).lean();
      return doc?.title === "Stop this reply" ? doc : null;
    });
    assert.ok(conversation);
    assert.equal(titleCalls().length, 0);
  });

  test("a failed title call falls back to the first 48 characters and is not retried", async () => {
    let attempts = 0;
    handlers.stream = async function* stream() {
      yield "Done";
    };
    handlers.title = async () => {
      attempts += 1;
      throw new Error("title down");
    };
    const content = "y".repeat(60);
    const user = await signup();
    const result = await postStream("/chat/send", user.cookie, { conversationId: null, content });
    assert.deepEqual(
      result.events.map((event) => event.event),
      ["meta", "token", "done", "title"],
    );
    assert.equal(result.events.at(-1).data.title, content.slice(0, 48));
    assert.equal(attempts, 1);
    const conversation = await Conversation.findById(result.events[0].data.conversationId).lean();
    assert.equal(conversation.title, content.slice(0, 48));
    const assistant = await Message.findOne({
      conversationId: conversation._id,
      role: "assistant",
    }).lean();
    assert.equal(assistant.incomplete, false);
  });

  test("a 429 produces the rate-limit message and keeps the user message", async () => {
    handlers.stream = async function stream() {
      const err = new Error("slow down");
      err.status = 429;
      err.beforeStream = true;
      throw err;
    };
    const user = await signup();
    const response = await send(`${ctx.url}/chat/send`, {
      method: "POST",
      cookie: user.cookie,
      body: { conversationId: null, content: "hello" },
    });
    assert.equal(response.status, 429);
    assert.deepEqual(response.body, { error: RATE_LIMIT_MESSAGE });
    const messages = await Message.find({ userId: user.id }).lean();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, "user");
    assert.equal(titleCalls().length, 0);
  });

  test("an upstream failure before streaming starts is 502", async () => {
    handlers.stream = async function stream() {
      const err = new Error("provider down");
      err.beforeStream = true;
      throw err;
    };
    const user = await signup();
    const response = await send(`${ctx.url}/chat/send`, {
      method: "POST",
      cookie: user.cookie,
      body: { conversationId: null, content: "hello" },
    });
    assert.equal(response.status, 502);
    assert.deepEqual(response.body, { error: "provider down" });
    const messages = await Message.find({ userId: user.id }).lean();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, "user");
  });

  test("a model outside the allowlist is 400 and an unauthenticated send is 401", async () => {
    const user = await signup();
    const unknown = await send(`${ctx.url}/chat/send`, {
      method: "POST",
      cookie: user.cookie,
      body: { conversationId: null, content: "hello", model: "openai/gpt-4o" },
    });
    assert.equal(unknown.status, 400);
    assert.deepEqual(unknown.body, { error: "Unknown model" });
    assert.equal(calls.length, 0);
    assert.equal(await Conversation.countDocuments({ userId: user.id }), 0);

    const anonymous = await send(`${ctx.url}/chat/send`, {
      method: "POST",
      body: { conversationId: null, content: "hello" },
    });
    assert.equal(anonymous.status, 401);
    assert.equal(calls.length, 0);
  });

  test("a malformed or unowned conversation id is 404", async () => {
    const owner = await signup();
    const other = await signup();
    const conversationId = await insertConversation(owner.id, "Kept");
    const malformed = await send(`${ctx.url}/chat/send`, {
      method: "POST",
      cookie: other.cookie,
      body: { conversationId: "nope", content: "hello" },
    });
    assert.equal(malformed.status, 404);
    const foreign = await send(`${ctx.url}/chat/send`, {
      method: "POST",
      cookie: other.cookie,
      body: { conversationId: String(conversationId), content: "hello" },
    });
    assert.equal(foreign.status, 404);
    assert.equal(calls.length, 0);
    assert.equal(await Message.countDocuments({ conversationId }), 0);
    const retry = await send(`${ctx.url}/chat/conversations/nope/retry`, {
      method: "POST",
      cookie: owner.cookie,
    });
    assert.equal(retry.status, 404);
  });

  test("retry replaces an incomplete reply and adds no user message", async () => {
    handlers.stream = async function* stream() {
      yield "retried";
    };
    const user = await signup();
    const conversationId = await insertConversation(user.id, "Kept");
    const base = new Date("2024-04-01T00:00:00.000Z");
    await insertMessage(user.id, conversationId, {
      role: "user",
      content: "Help",
      createdAt: base,
    });
    const oldAssistant = await insertMessage(user.id, conversationId, {
      role: "assistant",
      content: "Half",
      incomplete: true,
      model: models[1].id,
      createdAt: new Date(base.getTime() + 1000),
    });
    const result = await postStream(`/chat/conversations/${conversationId}/retry`, user.cookie);
    assert.deepEqual(
      result.events.map((event) => event.event),
      ["meta", "token", "done"],
    );
    assert.deepEqual(streamCalls()[0].messages, [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Help" },
    ]);
    assert.equal(streamCalls()[0].model, models[1].id);
    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 }).lean();
    assert.equal(messages.filter((message) => message.role === "user").length, 1);
    assert.equal(messages.filter((message) => message.role === "assistant").length, 1);
    assert.equal(
      messages.some((message) => String(message._id) === String(oldAssistant)),
      false,
    );
    assert.equal(messages.at(-1).content, "retried");
    assert.equal(messages.at(-1).incomplete, false);
    assert.equal(messages.at(-1).model, models[1].id);
    assert.equal(titleCalls().length, 0);
  });

  test("retry runs a user message that never got a reply", async () => {
    handlers.stream = async function* stream() {
      yield "now";
    };
    const user = await signup();
    const conversationId = await insertConversation(user.id, "Kept");
    await insertMessage(user.id, conversationId, {
      role: "user",
      content: "Still waiting",
      createdAt: new Date("2024-04-02T00:00:00.000Z"),
    });
    const result = await postStream(`/chat/conversations/${conversationId}/retry`, user.cookie);
    assert.equal(result.status, 200);
    assert.deepEqual(streamCalls()[0].messages, [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Still waiting" },
    ]);
    const messages = await Message.find({ conversationId }).lean();
    assert.equal(messages.filter((message) => message.role === "user").length, 1);
    assert.equal(messages.filter((message) => message.role === "assistant").length, 1);
  });

  test("retry on a complete reply is 400", async () => {
    const user = await signup();
    const conversationId = await insertConversation(user.id, "Kept");
    const base = new Date("2024-04-03T00:00:00.000Z");
    await insertMessage(user.id, conversationId, {
      role: "user",
      content: "Help",
      createdAt: base,
    });
    await insertMessage(user.id, conversationId, {
      role: "assistant",
      content: "All set",
      incomplete: false,
      model: models[0].id,
      createdAt: new Date(base.getTime() + 1000),
    });
    const before = await Message.countDocuments({ conversationId });
    const response = await send(`${ctx.url}/chat/conversations/${conversationId}/retry`, {
      method: "POST",
      cookie: user.cookie,
    });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "Nothing to retry" });
    assert.equal(calls.length, 0);
    assert.equal(await Message.countDocuments({ conversationId }), before);
  });
});
