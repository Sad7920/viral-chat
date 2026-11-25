import { describe, expect, it } from "vitest";
import { prependOlder, swapId, upsertById } from "./lists";

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

describe("prependOlder", () => {
  it("keeps the older page ahead of the loaded rows", () => {
    const items = [{ id: "c" }, { id: "d" }];
    const older = [{ id: "a" }, { id: "b" }];
    expect(prependOlder(items, older)).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
    ]);
    expect(items).toEqual([{ id: "c" }, { id: "d" }]);
    expect(older).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("drops ids that are already loaded", () => {
    const items = [
      { id: "b", n: 1 },
      { id: "c", n: 2 },
    ];
    expect(
      prependOlder(items, [
        { id: "a", n: 0 },
        { id: "b", n: 9 },
        { id: "a", n: 8 },
      ]),
    ).toEqual([
      { id: "a", n: 0 },
      { id: "b", n: 1 },
      { id: "c", n: 2 },
    ]);
  });

  it("returns a copy when the page is empty", () => {
    const items = [{ id: "a" }];
    const next = prependOlder(items, []);
    expect(next).toEqual(items);
    expect(next).not.toBe(items);
  });
});
