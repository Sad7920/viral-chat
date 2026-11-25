import assert from "node:assert/strict";
import test from "node:test";
import { decodeCursor, encodeCursor } from "../src/cursor.js";

const id = "a".repeat(24);
const t = new Date("2024-05-06T07:08:09.010Z");

test("encode and decode round-trip time and id", () => {
  const decoded = decodeCursor(encodeCursor(t, id));
  assert.ok(decoded);
  assert.equal(decoded.t.toISOString(), t.toISOString());
  assert.equal(decoded.id, id);
});

test("malformed cursors do not decode", () => {
  const cases = [
    "not a cursor",
    "",
    Buffer.from("{}", "utf8").toString("base64url"),
    Buffer.from("[]", "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ t: "nope", id }), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ t: t.toISOString(), id: "short" }), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ t: 1714979289010, id }), "utf8").toString("base64url"),
  ];
  for (const value of cases) assert.equal(decodeCursor(value), null);
});
