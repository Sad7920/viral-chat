import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { listen, send, startApp, tokenCookie } from "./helper.js";

const password = "correct-horse";
const limited = { error: "Too many requests. Try again shortly." };
const badLogin = { email: "not-an-email", password: "short" };

const openrouter = {
  async *streamCompletion() {
    yield "ok";
  },
  async completeOnce() {
    return "Payout";
  },
};

let ctx;

test.before(
  async () => {
    ctx = await startApp({
      openrouter,
      limits: { auth: { limit: 100 }, chat: { limit: 1 } },
    });
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
  assert.equal(response.status, 201, response.text);
  return tokenCookie(response.cookies);
}

async function post(path, cookie, body) {
  const response = await fetch(`${ctx.url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    json: text.startsWith("{") ? JSON.parse(text) : null,
  };
}

test("the 21st auth request in the window is 429", async () => {
  const app = await listen(ctx.env);
  try {
    for (let n = 1; n <= 20; n += 1) {
      const response = await send(`${app.url}/auth/login`, { method: "POST", body: badLogin });
      assert.equal(response.status, 400);
    }
    const blocked = await fetch(`${app.url}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email(), password }),
    });
    const body = await blocked.json();
    assert.equal(blocked.status, 429);
    assert.deepEqual(body, limited);
    assert.match(blocked.headers.get("ratelimit") ?? "", /^limit=20,/);
    assert.equal(blocked.headers.get("x-ratelimit-limit"), null);

    const logout = await send(`${app.url}/auth/logout`, { method: "POST" });
    assert.equal(logout.status, 204);
    const me = await send(`${app.url}/auth/me`);
    assert.equal(me.status, 401);
  } finally {
    await app.close();
  }
});

test("chat limits are per user and use the error shape", async () => {
  const a = await signup();
  const b = await signup();
  const first = await post("/chat/send", a, { conversationId: null, content: "hello" });
  assert.equal(first.status, 200, first.text);
  const id = first.text.match(/"conversationId":"([a-f\d]{24})"/i)?.[1];
  assert.ok(id);

  const again = await post("/chat/send", a, { conversationId: id, content: "again" });
  assert.equal(again.status, 429);
  assert.deepEqual(again.json, limited);

  const retry = await post(`/chat/conversations/${id}/retry`, a);
  assert.equal(retry.status, 429);
  assert.deepEqual(retry.json, limited);

  const escalate = await post(`/chat/conversations/${id}/escalate`, a, {
    summary: "Need a person",
  });
  assert.equal(escalate.status, 200);

  const other = await post("/chat/send", b, { conversationId: null, content: "hello" });
  assert.equal(other.status, 200, other.text);
  const second = await post("/chat/send", b, { conversationId: null, content: "more" });
  assert.equal(second.status, 429);
  assert.deepEqual(second.json, limited);
});
