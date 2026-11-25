import { describe, expect, it } from "vitest";
import { parseSSE } from "./sse";

async function collect(parts: Uint8Array[]) {
  async function* chunks() {
    for (const part of parts) yield part;
  }
  const frames = [];
  for await (const frame of parseSSE(chunks())) frames.push(frame);
  return frames;
}

function text(parts: string[]) {
  const encoder = new TextEncoder();
  return collect(parts.map((part) => encoder.encode(part)));
}

describe("parseSSE", () => {
  it("joins chunks that split a frame, including a CRLF broken in half", async () => {
    const frames = await text(["eve", "nt: token\r", "\ndata: hel", "lo\r\n", "\r\n"]);
    expect(frames).toEqual([{ event: "token", data: "hello" }]);
  });

  it("parses CRLF frames", async () => {
    const frames = await text(['event: meta\r\ndata: {"id":1}\r\n\r\n']);
    expect(frames).toEqual([{ event: "meta", data: '{"id":1}' }]);
  });

  it("joins multi-line data and skips comments", async () => {
    const frames = await text([
      ": keep-alive\n\n",
      "event: token\n",
      ": still a comment\n",
      "data: one\n",
      "data: two\n\n",
    ]);
    expect(frames).toEqual([{ event: "token", data: "one\ntwo" }]);
  });

  it("decodes a multibyte character split across chunks", async () => {
    const encoder = new TextEncoder();
    const head = encoder.encode("data: c");
    const frames = await collect([
      head,
      new Uint8Array([0xc3]),
      new Uint8Array([0xa9]),
      encoder.encode("\n\n"),
    ]);
    expect(frames).toEqual([{ event: "message", data: "cé" }]);
  });
});
