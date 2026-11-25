import { z } from "zod";

// Must match JWT_SECRET in .env.example. Development can boot on it; production cannot.
const PLACEHOLDER_JWT_SECRET = "dev-only-placeholder-not-a-secret-00";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_MODEL: z.string().min(1),
    CLIENT_ORIGIN: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && value.JWT_SECRET === PLACEHOLDER_JWT_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "placeholder is refused in production",
      });
    }
  });

export function parseEnv(source = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "env")))];
    throw new Error(`Invalid environment: ${names.join(", ")}`);
  }
  return result.data;
}
