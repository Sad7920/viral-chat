export function openSse(res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.socket?.setNoDelay(true);
}

export function writeEvent(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === "function") res.flush();
  } catch (err) {
    if (err?.code !== "ERR_STREAM_DESTROYED" && err?.code !== "EPIPE") throw err;
  }
}

export function endSse(res) {
  if (res.writableEnded) return;
  try {
    res.end();
  } catch (err) {
    if (err?.code !== "ERR_STREAM_DESTROYED" && err?.code !== "EPIPE") throw err;
  }
}
