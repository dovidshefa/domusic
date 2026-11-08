import { describe, it, expect } from "vitest";
import { parseLyrics, activeLineIndex, toLrc, hasHebrew, isSynced } from "./lyrics";

describe("lyrics", () => {
  it("parses LRC timestamps and sorts", () => {
    const l = parseLyrics("[ar:Test]\n[00:05.50] שלום\n[00:01.00] Hello");
    expect(l).toEqual([{ time: 1, text: "Hello" }, { time: 5.5, text: "שלום" }]);
    expect(isSynced(l)).toBe(true);
  });
  it("keeps plain lyrics unsynced", () => {
    const l = parseLyrics("one\n\ntwo");
    expect(l.map((x) => x.time)).toEqual([null, null]);
    expect(isSynced(l)).toBe(false);
  });
  it("finds the active line", () => {
    const l = parseLyrics("[00:01.00]a\n[00:04.00]b");
    expect(activeLineIndex(l, 0.5)).toBe(-1);
    expect(activeLineIndex(l, 4.2)).toBe(1);
  });
  it("round-trips to LRC", () => {
    expect(toLrc([{ time: 65.3, text: "x" }])).toBe("[01:05.30] x");
  });
  it("detects Hebrew", () => {
    expect(hasHebrew("Hello שלום")).toBe(true);
    expect(hasHebrew("Hello")).toBe(false);
  });
});

import { cleanTitle, cleanArtist } from "./lyrics";
describe("cleanTitle", () => {
  it("strips numbers, tags and artist prefix", () => {
    expect(cleanTitle("02 Ani Yehudi", "Yaakov Shwekey")).toBe("Ani Yehudi");
    expect(cleanTitle("Benny Friedman and Chananya Rotenberg - Mi K'amcha", "Benny Friedman")).toBe("Mi K'amcha");
    expect(cleanTitle("Akiva - Rotze Lihyot Tov (1)", "Akiva")).toBe("Rotze Lihyot Tov");
    expect(cleanTitle("Song (Official Video)")).toBe("Song");
  });
  it("skips placeholder artists", () => {
    expect(cleanArtist("Your Upload")).toBe("");
    expect(cleanArtist("Music Video, Baruch Levine")).toBe("Baruch Levine");
  });
});
