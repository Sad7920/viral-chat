import { once } from "node:events";
import { createServer } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";

async function closeServer(server) {
  if (!server.listening) return;
  const closed = once(server, "close");
  server.closeAllConnections();
  server.close();
  await closed;
}

export async function listen(env) {
  const app = createApp({ env });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP port");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await closeServer(server);
    },
  };
}

export async function startApp() {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);
  await User.init();
  const env = {
    NODE_ENV: "test",
    PORT: 4000,
    MONGODB_URI: uri,
    JWT_SECRET: "x".repeat(32),
    OPENROUTER_API_KEY: "test-key",
    OPENROUTER_MODEL: "placeholder/model",
    CLIENT_ORIGIN: "http://localhost:5173",
  };
  const server = await listen(env);
  return {
    env,
    url: server.url,
    async stop() {
      await server.close();
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
}

export async function send(url, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: text ? JSON.parse(text) : null,
    cookies: response.headers.getSetCookie(),
  };
}

export function tokenCookie(cookies) {
  const raw = cookies.find((value) => value.startsWith("token="));
  return raw ? raw.split(";")[0] : "";
}
