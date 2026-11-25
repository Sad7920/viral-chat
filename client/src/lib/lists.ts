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
