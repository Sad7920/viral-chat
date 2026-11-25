import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { User } from "../src/models/User.js";
import { listen, send, startApp, tokenCookie } from "./helper.js";

const password = "correct-horse";

let ctx;
let n = 0;

function nextEmail() {
  n += 1;
  return `user${n}@example.com`;
}

test.before(
  async () => {
    ctx = await startApp();
  },
  { timeout: 180_000 },
);

test.after(async () => {
  await ctx?.stop();
});

function signup(email = nextEmail(), pass = password) {
  return send(`${ctx.url}/auth/signup`, { method: "POST", body: { email, password: pass } });
}

test("signup stores a bcrypt hash and never the password", async () => {
  const response = await signup("  Ada@Example.com ");
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, { id: response.body.id, email: "ada@example.com" });
  const stored = await User.findOne({ email: "ada@example.com" }).select("+passwordHash").lean();
  assert.ok(stored);
  assert.equal(stored.password, undefined);
  assert.notEqual(stored.passwordHash, password);
  assert.match(stored.passwordHash, /^\$2b\$12\$/);
  assert.equal(response.text.includes(stored.passwordHash), false);
});

test("cookie flags are HttpOnly, SameSite=Lax, and Path=/", async () => {
  const response = await signup();
  const header = response.cookies[0];
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /(?:^|;\s*)Path=\/(?:;|$)/);
  assert.doesNotMatch(header, /(?:^|;)\s*Secure(?:;|$)/);

  const prod = await listen({ ...ctx.env, NODE_ENV: "production" });
  try {
    const secure = await send(`${prod.url}/auth/signup`, {
      method: "POST",
      body: { email: nextEmail(), password },
    });
    assert.match(secure.cookies[0], /;\s*Secure(?:;|$)/);
  } finally {
    await prod.close();
  }
});

test("login succeeds", async () => {
  const created = await signup("  Person@Example.com ");
  const response = await send(`${ctx.url}/auth/login`, {
    method: "POST",
    body: { email: "PERSON@example.com", password },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { id: created.body.id, email: "person@example.com" });
  assert.match(tokenCookie(response.cookies), /^token=/);
  const me = await send(`${ctx.url}/auth/me`, { cookie: tokenCookie(response.cookies) });
  assert.deepEqual(me.body, response.body);
});

test("wrong password and unknown email responses are identical", async () => {
  const email = nextEmail();
  assert.equal((await signup(email)).status, 201);
  const wrong = await send(`${ctx.url}/auth/login`, {
    method: "POST",
    body: { email, password: "not-the-password" },
  });
  const unknown = await send(`${ctx.url}/auth/login`, {
    method: "POST",
    body: { email: "missing@example.com", password: "not-the-password" },
  });
  assert.deepEqual(wrong.body, { error: "Invalid email or password" });
  assert.deepEqual(
    { status: unknown.status, body: unknown.body, cookies: unknown.cookies },
    { status: wrong.status, body: wrong.body, cookies: wrong.cookies },
  );
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.cookies, []);
});

test("duplicate email is 400", async () => {
  const email = nextEmail();
  assert.equal((await signup(email)).status, 201);
  const again = await signup(email);
  assert.equal(again.status, 400);
  assert.deepEqual(again.body, { error: "Email already in use" });
});

test("validation failures are 400", async () => {
  const cases = [
    { email: "not-an-email", password },
    { email: nextEmail(), password: "short" },
    { email: nextEmail(), password: "x".repeat(73) },
  ];
  for (const path of ["/auth/signup", "/auth/login"]) {
    for (const body of cases) {
      const response = await send(`${ctx.url}${path}`, { method: "POST", body });
      assert.equal(response.status, 400);
      assert.equal(typeof response.body.error, "string");
    }
  }
});

test("/auth/me is 401 without a cookie and 200 with one", async () => {
  const anon = await send(`${ctx.url}/auth/me`);
  assert.equal(anon.status, 401);
  assert.deepEqual(anon.body, { error: "Unauthorized" });
  const created = await signup();
  const me = await send(`${ctx.url}/auth/me`, { cookie: tokenCookie(created.cookies) });
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, created.body);
});

test("a tampered or expired cookie is 401", async () => {
  const created = await signup();
  const token = tokenCookie(created.cookies).slice("token=".length);
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  const bad = await send(`${ctx.url}/auth/me`, { cookie: `token=${tampered}` });
  assert.equal(bad.status, 401);

  const payload = jwt.verify(token, ctx.env.JWT_SECRET, { algorithms: ["HS256"] });
  const expired = jwt.sign(
    { sub: payload.sub, exp: Math.floor(Date.now() / 1000) - 10 },
    ctx.env.JWT_SECRET,
    { algorithm: "HS256" },
  );
  const old = await send(`${ctx.url}/auth/me`, { cookie: `token=${expired}` });
  assert.equal(old.status, 401);
});

test("logout clears the cookie", async () => {
  const created = await signup();
  const response = await send(`${ctx.url}/auth/logout`, {
    method: "POST",
    cookie: tokenCookie(created.cookies),
  });
  assert.equal(response.status, 204);
  assert.equal(response.text, "");
  assert.match(response.cookies[0], /^token=;/);
  assert.match(response.cookies[0], /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  const me = await send(`${ctx.url}/auth/me`, { cookie: "token=" });
  assert.equal(me.status, 401);
});

test("passwordHash never appears in a response", async () => {
  const email = nextEmail();
  const created = await signup(email);
  const responses = [
    created,
    await send(`${ctx.url}/auth/login`, { method: "POST", body: { email, password } }),
    await send(`${ctx.url}/auth/me`, { cookie: tokenCookie(created.cookies) }),
    await send(`${ctx.url}/auth/logout`, {
      method: "POST",
      cookie: tokenCookie(created.cookies),
    }),
    await send(`${ctx.url}/auth/login`, {
      method: "POST",
      body: { email, password: "not-the-password" },
    }),
    await send(`${ctx.url}/auth/login`, {
      method: "POST",
      body: { email: "nobody@example.com", password },
    }),
    await signup(email),
    await send(`${ctx.url}/auth/signup`, {
      method: "POST",
      body: { email: "bad", password: "short" },
    }),
    await send(`${ctx.url}/auth/me`),
  ];
  const stored = await User.findOne({ email }).select("+passwordHash").lean();
  for (const response of responses) {
    const raw = `${response.text}\n${response.cookies.join("\n")}`;
    assert.equal(raw.includes("passwordHash"), false);
    assert.equal(raw.includes(password), false);
    assert.equal(raw.includes(stored.passwordHash), false);
  }
});
