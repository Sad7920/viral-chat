import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import { errorMiddleware } from "./middleware/error.js";

const API_PREFIXES = ["/auth", "/chat", "/persona", "/models"];

function isApiPath(pathname) {
  return API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function createApp({ env }) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());

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
