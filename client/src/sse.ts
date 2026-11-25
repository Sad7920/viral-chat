export type SseFrame = { event: string; data: string };

// HTML event-stream: LF, CR, or CRLF end a line; ":" starts a comment; data lines join with "\n".
function createParser() {
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  function dispatch(): SseFrame | null {
    if (dataLines.length === 0) {
      eventName = "message";
      return null;
    }
    const frame = { event: eventName, data: dataLines.join("\n") };
    eventName = "message";
    dataLines = [];
    return frame;
  }

  function line(raw: string): SseFrame | null {
    if (raw === "") return dispatch();
    if (raw.startsWith(":")) return null;
    const colon = raw.indexOf(":");
    const field = colon === -1 ? raw : raw.slice(0, colon);
    let value = colon === -1 ? "" : raw.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
    return null;
  }

  function drain(final: boolean): SseFrame[] {
    const frames: SseFrame[] = [];
    let start = 0;
    let index = 0;
    while (index < buffer.length) {
      const char = buffer[index];
      if (char === "\n") {
        let end = index;
        if (end > start && buffer[end - 1] === "\r") end -= 1;
        const frame = line(buffer.slice(start, end));
        if (frame) frames.push(frame);
        index += 1;
        start = index;
        continue;
      }
      if (char === "\r") {
        const next = buffer[index + 1];
        if (next === undefined && !final) break;
        if (next === "\n") {
          const frame = line(buffer.slice(start, index));
          if (frame) frames.push(frame);
          index += 2;
          start = index;
          continue;
        }
        const frame = line(buffer.slice(start, index));
        if (frame) frames.push(frame);
        index += 1;
        start = index;
        continue;
      }
      index += 1;
    }
    buffer = buffer.slice(start);
    if (final) {
      if (buffer.length > 0) {
        const frame = line(buffer);
        buffer = "";
        if (frame) frames.push(frame);
      }
      const last = dispatch();
      if (last) frames.push(last);
    }
    return frames;
  }

  return {
    push(text: string) {
      buffer += text;
      return drain(false);
    },
    finish() {
      return drain(true);
    },
  };
}

export async function* parseSSE(source: AsyncIterable<Uint8Array>): AsyncGenerator<SseFrame> {
  const decoder = new TextDecoder();
  const parser = createParser();
  for await (const chunk of source) {
    yield* parser.push(decoder.decode(chunk, { stream: true }));
  }
  yield* parser.push(decoder.decode());
  yield* parser.finish();
}
