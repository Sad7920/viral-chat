import jwt from "jsonwebtoken";

const TOKEN_COOKIE = "token";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieBase(env) {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.NODE_ENV === "production",
  };
}

export function setAuthCookie(res, env, userId) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "7d",
  });
  res.cookie(TOKEN_COOKIE, token, { ...cookieBase(env), maxAge: MAX_AGE_MS });
}

export function clearAuthCookie(res, env) {
  res.clearCookie(TOKEN_COOKIE, cookieBase(env));
}

export function requireAuth(env) {
  return (req, res, next) => {
    const token = req.cookies?.[TOKEN_COOKIE];
    if (typeof token !== "string" || token.length === 0) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
      if (!payload || typeof payload !== "object" || typeof payload.sub !== "string") {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.userId = payload.sub;
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}
