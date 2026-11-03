import { describe, it, expect } from "vitest";
import { buildSmartPlaylist, type SmartTrack } from "./smart-playlist";

const t = (id: string, song: string, artist: string, genre: string | null = null): SmartTrack =>
  ({ id, song, artist, album: "", genre, kind: "audio", liked: false, plays: 0 });

const lib = [
  t("1", "Lecha Dodi", "Ishay Ribo", "jewish"),
  t("2", "Club Banger Remix", "DJ X", "edm"),
  t("3", "Nigun Acoustic", "Ishay Ribo", "jewish"),
  t("4", "Party Drop", "DJ Y", "dance"),
];

describe("free smart mixer", () => {
  it("Hebrew שבת prompt picks Jewish songs", () => {
    const r = buildSmartPlaylist("שבת", lib, 2, { seed: 1 });
    expect(r.trackIds.sort()).toEqual(["1", "3"]);
    expect(r.name).toBe("Shabbat Table Mix");
  });
  it("seed song comes first and pulls same artist", () => {
    const r = buildSmartPlaylist("", lib, 2, { seedId: "3", seed: 1 });
    expect(r.trackIds).toEqual(["3", "1"]);
  });
  it("energy 5 favors high-energy tracks", () => {
    const r = buildSmartPlaylist("", lib, 2, { energy: 5, seed: 1 });
    expect(r.trackIds.sort()).toEqual(["2", "4"]);
  });
});
