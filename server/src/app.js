import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { errorMiddleware } from "./middleware/error.js";
import { createOpenRouter } from "./openrouter.js";
import { authRouter } from "./routes/auth.js";
import { chatRouter } from "./routes/chat.js";
import { personaRouter } from "./routes/persona.js";

const API_PREFIXES = ["/auth", "/chat", "/persona", "/models"];
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const CHAT_WINDOW_MS = 60 * 1000;

function isApiPath(pathname) {
  return API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function rejectLimited(_req, res) {
  res.status(429).json({ error: "Too many requests. Try again shortly." });
}

function limiterSettings(overrides, defaults) {
  return {
    windowMs: overrides?.windowMs ?? defaults.windowMs,
    limit: overrides?.limit ?? defaults.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: rejectLimited,
  };
}

export function createApp({ env, openrouter, limits } = {}) {
  const app = express();
  // Railway is the one proxy in front of the app. Set this before the limiters.
  if (env.NODE_ENV === "production") app.set("trust proxy", 1);

  const authLimiter = rateLimit(
    limiterSettings(limits?.auth, { windowMs: AUTH_WINDOW_MS, limit: 20 }),
  );
  const chatLimiter = rateLimit({
    ...limiterSettings(limits?.chat, { windowMs: CHAT_WINDOW_MS, limit: 20 }),
    keyGenerator: (req) => req.userId,
  });

  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());
  app.use("/auth", authRouter(env, authLimiter));
  app.use("/chat", chatRouter(env, openrouter ?? createOpenRouter(env), chatLimiter));
  app.use(personaRouter(env));

  if (env.NODE_ENV === "production") {
    const dist = fileURLToPath(new URL("../../client/dist", import.meta.url));
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }
      if (isApiPath(req.path)) {
        next();
        return;
      }
      res.sendFile(path.join(dist, "index.html"), (err) => {
        if (err) next(err);
      });
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorMiddleware);
  return app;
}
