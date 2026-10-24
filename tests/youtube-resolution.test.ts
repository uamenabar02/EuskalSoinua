import { describe, it, expect } from "vitest";
import {
  isShortOrCommonTitle,
  checkArtistMatch,
  scoreHit,
  cleanTitle,
  extractCoreTitle,
  matchesTitle,
  TRUSTED_BASQUE_LABELS,
  type SearchHit,
} from "@/lib/sources/streaming";

describe("YouTube Resolution & Strict Artist Matching Engine", () => {
  describe("isShortOrCommonTitle detection", () => {
    it("should flag short, single-word or 2-word titles prone to collisions", () => {
      expect(isShortOrCommonTitle("Loco")).toBe(true);
      expect(isShortOrCommonTitle("Su")).toBe(true);
      expect(isShortOrCommonTitle("Gaua")).toBe(true);
      expect(isShortOrCommonTitle("Intro")).toBe(true);
      expect(isShortOrCommonTitle("Outro")).toBe(true);
      expect(isShortOrCommonTitle("Musa 13")).toBe(true);
      expect(isShortOrCommonTitle("Beldurrik Gabe")).toBe(true);
      expect(isShortOrCommonTitle("Aske Maitte")).toBe(true);
    });

    it("should NOT flag unique multi-word titles as short or common", () => {
      expect(isShortOrCommonTitle("Zeinen Ederra Izango Den")).toBe(false);
      expect(isShortOrCommonTitle("Shane McGowan's Basque Paddys")).toBe(false);
      expect(isShortOrCommonTitle("Denbora Lehen Orain")).toBe(false);
    });
  });

  describe("checkArtistMatch & Basque Label Verification", () => {
    it("should match artist in title when uploaded by a trusted Basque label channel", () => {
      const match = checkArtistMatch(
        "Vendetta",
        "GOR DISCOS",
        "Vendetta - Loco (Videoclip Oficial)"
      );
      expect(match.matched).toBe(true);
      expect(match.isOfficialLabel).toBe(true);
      expect(match.scoreBonus).toBeGreaterThanOrEqual(60);
    });

    it("should recognize YouTube Music official Topic channels", () => {
      const match = checkArtistMatch(
        "ZETAK",
        "ZETAK - Topic",
        "Zeinen Ederra Izango Den"
      );
      expect(match.matched).toBe(true);
      expect(match.isTopicChannel).toBe(true);
      expect(match.scoreBonus).toBe(80);
    });

    it("should match collaborating artists in multi-artist songs", () => {
      const match = checkArtistMatch(
        "Fane, LA TXAMA, Tatta & Chickjuarez",
        "LA TXAMA",
        "LA TXAMA - Musa 13 (Audio Oficial)"
      );
      expect(match.matched).toBe(true);
      expect(match.scoreBonus).toBeGreaterThanOrEqual(50);
    });

    it("should reject when artist is completely missing from both author and title", () => {
      const match = checkArtistMatch(
        "Vendetta",
        "Anuel AA",
        "Anuel AA - Loco (Video Oficial)"
      );
      expect(match.matched).toBe(false);
      expect(match.scoreBonus).toBe(0);
    });
  });

  describe("scoreHit - Universal Disambiguation Fix (e.g. Vendetta - Loco)", () => {
    it("MUST strictly reject unrelated songs sharing short titles like 'Loco'", () => {
      const unrelatedReggaetonHit: SearchHit = {
        videoId: "xyz12345678",
        title: "Anuel AA - Loco (Official Video)",
        author: "Anuel AA",
        duration: 210,
        thumbnail: null,
      };

      const score = scoreHit(unrelatedReggaetonHit, "Vendetta", "Loco", 210);
      expect(score).toBe(-999);
    });

    it("MUST strictly reject viral dance mixes sharing common words", () => {
      const viralMixHit: SearchHit = {
        videoId: "mix12345678",
        title: "Loco Party Club Mix 2024",
        author: "DJ World",
        duration: 180,
        thumbnail: null,
      };

      const score = scoreHit(viralMixHit, "Vendetta", "Loco", 210);
      expect(score).toBe(-999);
    });

    it("MUST accept the authentic Basque track with high confidence", () => {
      const authenticHit: SearchHit = {
        videoId: "ven12345678",
        title: "Vendetta - Loco (Videoclip Oficial)",
        author: "GOR DISCOS",
        duration: 215,
        thumbnail: null,
      };

      const score = scoreHit(authenticHit, "Vendetta", "Loco", 210);
      expect(score).toBeGreaterThanOrEqual(150);
    });

    it("MUST reject YouTube Shorts (<35s) for standard songs", () => {
      const shortsHit: SearchHit = {
        videoId: "sho12345678",
        title: "Vendetta - Loco #Shorts",
        author: "Vendetta",
        duration: 24,
        thumbnail: null,
      };

      const score = scoreHit(shortsHit, "Vendetta", "Loco", 210);
      expect(score).toBe(-999);
    });

    it("MUST reject 45-minute album compilations or DJ sets for single track queries", () => {
      const compilationHit: SearchHit = {
        videoId: "com12345678",
        title: "Vendetta - Full Album Discography 2017",
        author: "Vendetta",
        duration: 2800,
        thumbnail: null,
      };

      const score = scoreHit(compilationHit, "Vendetta", "Loco", 210);
      expect(score).toBe(-999);
    });
  });

  describe("Ground Truth Basque Artists & Key Tracks Validation", () => {
    const testCases = [
      {
        artist: "Bengo",
        title: "Galdu Gattezen",
        hitTitle: "Bengo - Galdu Gattezen (Bideoklipa)",
        hitAuthor: "Bengo",
        expectedScoreMin: 120,
      },
      {
        artist: "ZETAK",
        title: "Zeinen Ederra Izango Den",
        hitTitle: "ZETAK - Zeinen Ederra Izango Den",
        hitAuthor: "ZETAK",
        expectedScoreMin: 140,
      },
      {
        artist: "La Txama",
        title: "Musa 13",
        hitTitle: "La Txama - Musa 13 (Audio Oficial)",
        hitAuthor: "La Txama",
        expectedScoreMin: 120,
      },
      {
        artist: "Izaro",
        title: "Aske Maitte",
        hitTitle: "IZARO - Aske Maitte (feat. Gatibu)",
        hitAuthor: "IZARO",
        expectedScoreMin: 120,
      },
      {
        artist: "Anari",
        title: "Efemerideak",
        hitTitle: "Anari - Efemerideak",
        hitAuthor: "Elkar",
        expectedScoreMin: 120,
      },
      {
        artist: "Streetwise",
        title: "Txantxangorria",
        hitTitle: "Streetwise - Txantxangorria (Official Video)",
        hitAuthor: "Streetwise",
        expectedScoreMin: 120,
      },
      {
        artist: "Bizardunak",
        title: "Nazi de Fresa",
        hitTitle: "Bizardunak - Nazi de Fresa",
        hitAuthor: "Gor Discos",
        expectedScoreMin: 120,
      },
      {
        artist: "Olaia Inziarte",
        title: "Denbora Lehen Orain",
        hitTitle: "Olaia Inziarte - Denbora Lehen Orain (Bideoklipa)",
        hitAuthor: "Olaia Inziarte",
        expectedScoreMin: 120,
      },
      {
        artist: "Tatta",
        title: "Muxutxo Bana",
        hitTitle: "Tatta - Muxutxo Bana (Audio)",
        hitAuthor: "Tatta",
        expectedScoreMin: 120,
      },
      {
        artist: "Belako",
        title: "Render Me Numb",
        hitTitle: "Belako - Render Me Numb (Official Music Video)",
        hitAuthor: "Belako",
        expectedScoreMin: 120,
      },
    ];

    for (const tc of testCases) {
      it(`correctly resolves and scores authentic hit for ${tc.artist} - "${tc.title}"`, () => {
        const hit: SearchHit = {
          videoId: "valid123456",
          title: tc.hitTitle,
          author: tc.hitAuthor,
          duration: 210,
          thumbnail: null,
        };
        const score = scoreHit(hit, tc.artist, tc.title, 210);
        expect(score).toBeGreaterThanOrEqual(tc.expectedScoreMin);
      });
    }
  });
});
