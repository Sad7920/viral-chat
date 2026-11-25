export function encodeCursor(t, id) {
  return Buffer.from(JSON.stringify({ t: new Date(t).toISOString(), id: String(id) })).toString(
    "base64url",
  );
}

export function decodeCursor(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (typeof parsed.t !== "string" || typeof parsed.id !== "string") return null;
    if (!/^[a-f\d]{24}$/i.test(parsed.id)) return null;
    const t = new Date(parsed.t);
    if (Number.isNaN(t.getTime())) return null;
    return { t, id: parsed.id };
  } catch {
    return null;
  }
}
