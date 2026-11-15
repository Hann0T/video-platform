import { describe, it, expect } from "vitest";
import { parseRange } from "../src/lib/range.js";

describe("parseRange", () => {
  const size = 1000;

  it("returns none without a header", () => {
    expect(parseRange(undefined, size)).toEqual({ type: "none" });
    expect(parseRange("", size)).toEqual({ type: "none" });
  });

  it("parses a closed range", () => {
    expect(parseRange("bytes=0-99", size)).toEqual({ type: "range", start: 0, end: 99 });
  });

  it("parses an open-ended range (what browsers send)", () => {
    expect(parseRange("bytes=500-", size)).toEqual({ type: "range", start: 500, end: 999 });
  });

  it("parses a suffix range", () => {
    expect(parseRange("bytes=-100", size)).toEqual({ type: "range", start: 900, end: 999 });
  });

  it("clamps a suffix longer than the file", () => {
    expect(parseRange("bytes=-5000", size)).toEqual({ type: "range", start: 0, end: 999 });
  });

  it("clamps an end past the file", () => {
    expect(parseRange("bytes=900-5000", size)).toEqual({ type: "range", start: 900, end: 999 });
  });

  it("reports unsatisfiable when start is at or past the end", () => {
    expect(parseRange("bytes=1000-", size)).toEqual({ type: "unsatisfiable" });
    expect(parseRange("bytes=2000-3000", size)).toEqual({ type: "unsatisfiable" });
    expect(parseRange("bytes=-0", size)).toEqual({ type: "unsatisfiable" });
  });

  it("reports unsatisfiable for any range on an empty file", () => {
    expect(parseRange("bytes=0-", 0)).toEqual({ type: "unsatisfiable" });
    expect(parseRange("bytes=-10", 0)).toEqual({ type: "unsatisfiable" });
  });

  it("ignores malformed, reversed and multi-range headers", () => {
    for (const h of ["bytes=", "bytes=-", "items=0-1", "bytes=abc", "bytes=5-1", "bytes=0-1,5-6"]) {
      expect(parseRange(h, size)).toEqual({ type: "none" });
    }
  });
});
