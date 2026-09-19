import { describe, it, expect } from "vitest";

describe("Definition of Done — Basque Music Artists & Ground Truth", () => {
  const groundTruthArtists = [
    { artist: "Bengo", key_tracks: ["Galdu Gattezen", "Beldurrik Gabe"], genre: "Basque Urban Pop" },
    { artist: "ZETAK", key_tracks: ["Zeinen Ederra Izango Den", "Itzulera"], genre: "Basque Synth Pop" },
    { artist: "La Txama", key_tracks: ["Musa 13", "Fusilaren Hotsa"], genre: "Basque Fusion" },
    { artist: "Izaro", key_tracks: ["Aske Maitte", "Oso Blanco"], genre: "Basque Indie Pop" },
    { artist: "Anari", key_tracks: ["Efemerideak", "Orfidentalak"], genre: "Basque Alt Rock" },
    { artist: "Streetwise", key_tracks: ["Txantxangorria", "Izatea Baino"], genre: "Basque Street Punk" },
    { artist: "Bizardunak", key_tracks: ["Nazi de Fresa", "Shane McGowan's Basque Paddys"], genre: "Basque Folk Punk" },
    { artist: "Olaia Inziarte", key_tracks: ["Denbora Lehen Orain"], genre: "Basque Indie" },
    { artist: "Tatta", key_tracks: ["Muxutxo Bana"], genre: "Basque Urban/Trap" },
    { artist: "Belako", key_tracks: ["Render Me Numb"], genre: "Basque Post-Punk" },
  ];

  it("should contain all required ground truth Basque artists with valid tracks and genres", () => {
    expect(groundTruthArtists).toHaveLength(10);
    groundTruthArtists.forEach((item) => {
      expect(item.artist).toBeTruthy();
      expect(item.genre).toBeTruthy();
      expect(item.key_tracks.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("distinguishes between contemporary urban Basque artists and classic rock/folk punk", () => {
    const urbanArtists = groundTruthArtists.filter((a) =>
      a.genre.toLowerCase().includes("urban") || a.genre.toLowerCase().includes("trap")
    );
    const punkRockArtists = groundTruthArtists.filter((a) =>
      a.genre.toLowerCase().includes("punk") || a.genre.toLowerCase().includes("rock")
    );

    expect(urbanArtists.map((a) => a.artist)).toEqual(expect.arrayContaining(["Bengo", "Tatta"]));
    expect(punkRockArtists.map((a) => a.artist)).toEqual(
      expect.arrayContaining(["Streetwise", "Bizardunak", "Anari", "Belako"])
    );
  });
});
