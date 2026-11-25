import { describe, expect, it } from "vitest";
import { swapId, upsertById } from "./lists";

describe("upsertById", () => {
  it("prepends an unknown id without mutating the input", () => {
    const items = [{ id: "a", title: "A" }];
    const next = upsertById(items, { id: "b", title: "B" });
    expect(next).toEqual([
      { id: "b", title: "B" },
      { id: "a", title: "A" },
    ]);
    expect(items).toEqual([{ id: "a", title: "A" }]);
  });

  it("replaces a matching id in place", () => {
    const items = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    const next = upsertById(items, { id: "b", title: "B2" });
    expect(next).toEqual([
      { id: "a", title: "A" },
      { id: "b", title: "B2" },
    ]);
    expect(next[0]).toBe(items[0]);
  });
});

describe("swapId", () => {
  it("replaces one id and keeps the other fields", () => {
    const items = [
      { id: "temp", n: 1 },
      { id: "keep", n: 2 },
    ];
    expect(swapId(items, "temp", "real")).toEqual([
      { id: "real", n: 1 },
      { id: "keep", n: 2 },
    ]);
    expect(items[0]?.id).toBe("temp");
  });

  it("returns a copy when the id is absent", () => {
    const items = [{ id: "a", n: 1 }];
    const next = swapId(items, "missing", "x");
    expect(next).toEqual(items);
    expect(next).not.toBe(items);
  });
});
