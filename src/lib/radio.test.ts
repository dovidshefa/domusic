import { describe, it, expect } from "vitest";
import { pickRadioTrack } from "./radio";

const t = (id: string, artist: string, genre: string | null = null) =>
  ({ id, artist, genre, kind: "audio", liked: false, plays: 0 });

describe("pickRadioTrack", () => {
  it("prefers the same artist", () => {
    const seed = t("a", "Ishay Ribo", "Jewish");
    const all = [seed, t("b", "Other", "Rock"), t("c", "Ishay Ribo", "Jewish")];
    expect(pickRadioTrack(seed, all, [], () => 0)?.id).toBe("c");
  });
  it("never repeats recently played songs when others exist", () => {
    const seed = t("a", "X");
    const all = [seed, t("b", "X"), t("c", "Y")];
    expect(pickRadioTrack(seed, all, ["b"], () => 0)?.id).toBe("c");
  });
  it("returns null with only the seed", () => {
    const seed = t("a", "X");
    expect(pickRadioTrack(seed, [seed], [])).toBeNull();
  });
});
