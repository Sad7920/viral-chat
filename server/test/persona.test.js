import assert from "node:assert/strict";
import test from "node:test";
import { defaultModel, models } from "../src/allowlist.js";
import {
  agentName,
  companyName,
  greeting,
  suggestedPrompts,
  systemPrompt,
  titleInstruction,
} from "../src/persona.js";
import { listen, send, testEnv } from "./helper.js";

test("persona is public and does not leak the prompts", async () => {
  const server = await listen(testEnv());
  try {
    const response = await send(`${server.url}/persona`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { agentName, companyName, greeting, suggestedPrompts });
    assert.equal(response.text.includes(systemPrompt), false);
    assert.equal(response.text.includes(titleInstruction), false);
  } finally {
    await server.close();
  }
});

test("models matches the allowlist", async () => {
  const env = testEnv();
  const server = await listen(env);
  try {
    const response = await send(`${server.url}/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { models, defaultModel: env.OPENROUTER_MODEL });
  } finally {
    await server.close();
  }
});

test("the allowlist refuses a default that is not on it", () => {
  assert.throws(() => defaultModel({ OPENROUTER_MODEL: "placeholder/model" }), /allowlist/);
  assert.equal(defaultModel({ OPENROUTER_MODEL: models[0].id }), models[0].id);
});
