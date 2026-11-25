import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import jwt from "jsonwebtoken";
import { listen, send, startApp } from "./helper.js";

const password = "correct-horse";
const origin = "http://localhost:5173";
const indexPath = fileURLToPath(new URL("../../client/dist/index.html", import.meta.url));
const apiPaths = ["/auth", "/auth/me", "/chat", "/chat/history", "/persona", "/models"];

let ctx;
let createdIndex = false;
let indexHtml = "";

test.before(
  async () => {
    try {
      await access(indexPath);
    } catch {
      await mkdir(path.dirname(indexPath), { recursive: true });
      await writeFile(indexPath, "<!doctype html><title>lumen-spa-fallback</title>\n");
      createdIndex = true;
    }
    indexHtml = await readFile(indexPath, "utf8");
    try {
      ctx = await startApp();
    } catch (err) {
      if (createdIndex) await rm(indexPath, { force: true });
      throw err;
    }
  },
  { timeout: 180_000 },
);

test.after(async () => {
  await ctx?.stop();
  if (createdIndex) await rm(indexPath, { force: true });
});

function boot(nodeEnv, limits) {
  return listen({ ...ctx.env, NODE_ENV: nodeEnv }, { limits });
}

async function readJson(response) {
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: text ? JSON.parse(text) : null,
    headers: response.headers,
  };
}

async function login(url, forwarded) {
  const headers = { "content-type": "application/json" };
  if (forwarded) headers["x-forwarded-for"] = forwarded;
  const response = await fetch(`${url}/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "not-an-email", password: "short" }),
  });
  return readJson(response);
}

function assertNoTrace(text) {
  assert.equal(text.includes("stack"), false);
  assert.doesNotMatch(text, /at\s+\S+\s+\(|node:|\.js:\d+/);
}

async function assertCors(url) {
  const ok = await fetch(`${url}/persona`, { headers: { Origin: origin } });
  assert.equal(ok.headers.get("access-control-allow-origin"), origin);
  assert.equal(ok.headers.get("access-control-allow-credentials"), "true");

  const preflight = await fetch(`${url}/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");

  const evil = "https://evil.example";
  const blocked = await fetch(`${url}/persona`, { headers: { Origin: evil } });
  assert.equal(blocked.headers.get("access-control-allow-origin"), origin);
  assert.notEqual(blocked.headers.get("access-control-allow-origin"), "*");
  assert.equal(blocked.headers.get("access-control-allow-credentials"), "true");
}

async function assertNoStack(url, env) {
  const broken = await fetch(`${url}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  const badText = await broken.text();
  const badBody = JSON.parse(badText);
  assert.equal(broken.status, 400);
  assert.deepEqual(Object.keys(badBody), ["error"]);
  assert.equal(typeof badBody.error, "string");
  assertNoTrace(badText);

  const token = jwt.sign({ sub: "not-an-object-id" }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
  const crash = await fetch(`${url}/auth/me`, { headers: { cookie: `token=${token}` } });
  const crashText = await crash.text();
  assert.equal(crash.status, 500);
  assert.deepEqual(JSON.parse(crashText), { error: "Internal server error" });
  assertNoTrace(crashText);
}

async function assertSpa(url, enabled) {
  const page = await fetch(`${url}/login`);
  const text = await page.text();
  if (enabled) {
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(text, indexHtml);
  } else {
    assert.equal(page.status, 404);
    assert.deepEqual(JSON.parse(text), { error: "Not found" });
  }
  for (const apiPath of apiPaths) {
    const response = await fetch(`${url}${apiPath}`);
    const body = await response.text();
    const type = response.headers.get("content-type") ?? "";
    assert.equal(type.includes("text/html"), false, apiPath);
    assert.notEqual(body, indexHtml, apiPath);
  }
}

test("development and production keep cookie, cors, errors and the spa apart", async () => {
  const dev = await boot("development");
  const prod = await boot("production");
  try {
    const devSignup = await send(`${dev.url}/auth/signup`, {
      method: "POST",
      body: { email: "dev-mode@example.com", password },
    });
    assert.equal(devSignup.status, 201);
    assert.doesNotMatch(devSignup.cookies[0], /;\s*Secure(?:;|$)/);

    const prodSignup = await send(`${prod.url}/auth/signup`, {
      method: "POST",
      body: { email: "prod-mode@example.com", password },
    });
    assert.equal(prodSignup.status, 201);
    assert.match(prodSignup.cookies[0], /;\s*Secure(?:;|$)/);

    await assertCors(dev.url);
    await assertCors(prod.url);
    await assertNoStack(dev.url, ctx.env);
    await assertNoStack(prod.url, ctx.env);
    await assertSpa(dev.url, false);
    await assertSpa(prod.url, true);
  } finally {
    await dev.close();
    await prod.close();
  }
});

test("trust proxy is 1 only in production, so clients do not share an address", async () => {
  const dev = await boot("development", { auth: { limit: 1 } });
  const prod = await boot("production", { auth: { limit: 1 } });
  try {
    assert.equal((await login(dev.url)).status, 400);
    assert.equal((await login(dev.url, "203.0.113.9")).status, 429);
    assert.equal((await login(dev.url, "203.0.113.8")).status, 429);

    assert.equal((await login(prod.url, "203.0.113.10")).status, 400);
    assert.equal((await login(prod.url, "203.0.113.10")).status, 429);
    assert.equal((await login(prod.url, "203.0.113.11")).status, 400);
  } finally {
    await dev.close();
    await prod.close();
  }
});
