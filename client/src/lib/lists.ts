// New ids go to the front so a newest-first list keeps that order.
export function upsertById<T extends { id: string }>(items: readonly T[], item: T): T[] {
  const index = items.findIndex((row) => row.id === item.id);
  if (index === -1) return [item, ...items];
  return items.map((row, position) => (position === index ? item : row));
}

export function swapId<T extends { id: string }>(
  items: readonly T[],
  fromId: string,
  toId: string,
): T[] {
  const index = items.findIndex((row) => row.id === fromId);
  if (index === -1 || fromId === toId) return [...items];
  return items.map((row, position) => (position === index ? { ...row, id: toId } : row));
}

// Older rows stay ahead of the ones already on screen. Loaded ids win.
export function prependOlder<T extends { id: string }>(
  items: readonly T[],
  older: readonly T[],
): T[] {
  if (older.length === 0) return [...items];
  const seen = new Set(items.map((item) => item.id));
  const fresh: T[] = [];
  for (const item of older) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    fresh.push(item);
  }
  return fresh.length === 0 ? [...items] : [...fresh, ...items];
}
