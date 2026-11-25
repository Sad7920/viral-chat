import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";
import { clearAuthCookie, requireAuth, setAuthCookie } from "../middleware/auth.js";
import { User } from "../models/User.js";

// Unknown emails still run a compare so the response time matches a real user.
const DUMMY_HASH = await bcrypt.hash("timing-safe-dummy", 12);

const credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(72),
});

function validationError(result) {
  const fields = new Set(result.error.issues.map((issue) => String(issue.path[0])));
  if (fields.has("email")) return "Enter a valid email";
  if (fields.has("password")) return "Password must be 8 to 72 characters";
  return "Invalid email or password";
}

function isDuplicate(err) {
  return typeof err === "object" && err !== null && "code" in err && err.code === 11000;
}

function publicUser(user) {
  return { id: user.id, email: user.email };
}

export function authRouter(env) {
  const router = Router();

  router.post("/signup", async (req, res, next) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationError(parsed) });
      return;
    }
    try {
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const user = await User.create({ email: parsed.data.email, passwordHash });
      setAuthCookie(res, env, user.id);
      res.status(201).json(publicUser(user));
    } catch (err) {
      if (isDuplicate(err)) {
        res.status(400).json({ error: "Email already in use" });
        return;
      }
      next(err);
    }
  });

  router.post("/login", async (req, res, next) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationError(parsed) });
      return;
    }
    try {
      const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
      const hash = user?.passwordHash ?? DUMMY_HASH;
      const match = await bcrypt.compare(parsed.data.password, hash);
      if (!user || !match) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      setAuthCookie(res, env, user.id);
      res.status(200).json(publicUser(user));
    } catch (err) {
      next(err);
    }
  });

  router.post("/logout", (_req, res) => {
    clearAuthCookie(res, env);
    res.status(204).end();
  });

  router.get("/me", requireAuth(env), async (req, res, next) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      res.json(publicUser(user));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
