import assert from "node:assert/strict";
import test from "node:test";
import {
  RATE_LIMIT_MESSAGE,
  createOpenRouter,
  createSseParser,
  readSsePayload,
} from "../src/openrouter.js";
import { testEnv } from "./helper.js";

const chunks = [
  ': OPENROUTER PROCESSING\n\ndata: {"choices":[{"delta":{"content":"Hel',
  'lo"}}]}\r\n\r\ndata: {"choices":[{"delta":{"reasoning":"hidden chain of thought","reasoning_details":[{"type":"reasoning.text","text":"hidden chain of thought"}]}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" there"}}]}\n\ndata: [DONE]\n\ndata: {"choices":[{"delta":{"content":"AFTER"}}]}\n\n',
];

function deltasFromChunks(parts) {
  const parser = createSseParser();
  const deltas = [];
  for (const part of parts) {
    for (const payload of parser.push(part)) {
      const event = readSsePayload(payload);
      if (event.type === "done") return deltas;
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "delta") deltas.push(event.text);
    }
  }
  return deltas;
}

function chunkedBody(parts) {
  let index = 0;
  const encoder = new TextEncoder();
  return new ReadableStream({
    pull(controller) {
      if (index >= parts.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(parts[index]));
      index += 1;
    },
  });
}

test("SSE parser keeps content across chunk splits and drops comments, reasoning, and trailing data", () => {
  const deltas = deltasFromChunks(chunks);
  assert.deepEqual(deltas, ["Hello", " there"]);
  const text = deltas.join("");
  assert.equal(text.includes("hidden"), false);
  assert.equal(text.includes("OPENROUTER"), false);
  assert.equal(text.includes("AFTER"), false);
});

test("streamCompletion yields the same deltas and stops at [DONE]", async () => {
  let body;
  const fetchImpl = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(chunkedBody(chunks), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };
  const client = createOpenRouter(testEnv(), fetchImpl);
  const deltas = [];
  for await (const delta of client.streamCompletion({
    model: "m",
    messages: [{ role: "user", content: "hi" }],
  })) {
    deltas.push(delta);
  }
  assert.deepEqual(deltas, ["Hello", " there"]);
  assert.equal(body.stream, true);
  assert.equal(body.model, "m");
});

test("a mid-stream error object fails the generator after earlier content", async () => {
  const fetchImpl = async () =>
    new Response(
      chunkedBody([
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        'data: {"error":{"message":"provider blew up","code":503}}\n\n',
      ]),
      { status: 200 },
    );
  const client = createOpenRouter(testEnv(), fetchImpl);
  const gen = client.streamCompletion({ model: "m", messages: [] });
  const first = await gen.next();
  assert.equal(first.value, "Hi");
  await assert.rejects(
    () => gen.next(),
    (err) => {
      assert.equal(err.message, "provider blew up");
      assert.equal(err.beforeStream, false);
      assert.equal(err.status, 502);
      return true;
    },
  );
});

test("HTTP 429 becomes the rate-limit message before any delta", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: "slow down", code: 429 } }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  const client = createOpenRouter(testEnv(), fetchImpl);
  await assert.rejects(
    () => client.streamCompletion({ model: "m", messages: [] }).next(),
    (err) => {
      assert.equal(err.message, RATE_LIMIT_MESSAGE);
      assert.equal(err.status, 429);
      assert.equal(err.beforeStream, true);
      return true;
    },
  );
});

test("other HTTP failures become 502 before any delta", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: "provider down" } }), { status: 500 });
  const client = createOpenRouter(testEnv(), fetchImpl);
  await assert.rejects(
    () => client.streamCompletion({ model: "m", messages: [] }).next(),
    (err) => {
      assert.equal(err.message, "provider down");
      assert.equal(err.status, 502);
      assert.equal(err.beforeStream, true);
      return true;
    },
  );
});

test("completeOnce returns trimmed content and ignores reasoning", async () => {
  let body;
  let authorization;
  const env = testEnv();
  const fetchImpl = async (_url, init) => {
    body = JSON.parse(init.body);
    authorization = init.headers.Authorization;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { role: "assistant", content: "  Payout timing\n", reasoning: "secret" },
          },
        ],
      }),
      { status: 200 },
    );
  };
  const client = createOpenRouter(env, fetchImpl);
  const title = await client.completeOnce({
    model: "m",
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 30,
  });
  assert.equal(title, "Payout timing");
  assert.equal(title.includes("secret"), false);
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 30);
  assert.equal(authorization, `Bearer ${env.OPENROUTER_API_KEY}`);
});
