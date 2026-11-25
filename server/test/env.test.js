import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseEnv } from "../src/env.js";

const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const placeholder = example.match(/^JWT_SECRET=(.*)$/m)?.[1];
if (!placeholder) {
  throw new Error("JWT_SECRET missing from .env.example");
}

function valid(overrides = {}) {
  return {
    NODE_ENV: "development",
    MONGODB_URI: "mongodb://mongo:27017/lumen",
    JWT_SECRET: "x".repeat(32),
    OPENROUTER_API_KEY: "test-key",
    OPENROUTER_MODEL: "placeholder/model",
    CLIENT_ORIGIN: "http://localhost:5173",
    ...overrides,
  };
}

test("valid env parses and applies the PORT default", () => {
  const env = parseEnv(valid());
  assert.equal(env.PORT, 4000);
});

test("a short JWT_SECRET is rejected", () => {
  assert.throws(() => parseEnv(valid({ JWT_SECRET: "short" })), /JWT_SECRET/);
});

test("the example JWT_SECRET is rejected only in production", () => {
  const dev = parseEnv(valid({ JWT_SECRET: placeholder, NODE_ENV: "development" }));
  assert.equal(dev.JWT_SECRET, placeholder);
  assert.throws(
    () => parseEnv(valid({ JWT_SECRET: placeholder, NODE_ENV: "production" })),
    /JWT_SECRET/,
  );
});

test("missing OPENROUTER_API_KEY is rejected", () => {
  const source = valid();
  delete source.OPENROUTER_API_KEY;
  assert.throws(() => parseEnv(source), /OPENROUTER_API_KEY/);
});

test("the error message names every bad variable", () => {
  assert.throws(
    () => parseEnv({ NODE_ENV: "production", JWT_SECRET: "short" }),
    (err) => {
      assert.ok(err instanceof Error);
      for (const name of [
        "JWT_SECRET",
        "MONGODB_URI",
        "OPENROUTER_API_KEY",
        "OPENROUTER_MODEL",
        "CLIENT_ORIGIN",
      ]) {
        assert.match(err.message, new RegExp(name));
      }
      return true;
    },
  );
});
