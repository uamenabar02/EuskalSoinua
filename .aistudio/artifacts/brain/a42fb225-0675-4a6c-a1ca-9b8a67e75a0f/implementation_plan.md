# Granular Artist Discography Auditing, Removal & Disambiguation Engine

Comprehensive architectural plan to enable granular removal of any artist album or track (even those labeled "Verified Authentic") both via the Audit Discography modal and directly on the artist page, backed by a persistent exclusion blacklist and a fine-tuned Basque orthography and genre-conflict disambiguation engine.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed by the user in Phase 1 clarification:
> - **Removal Surfaces**: Users can remove verified authentic albums and individual songs both **inside the Audit modal** (with per-song checkboxes in expanded album views) and **directly on the artist page** (via quick-delete action triggers with confirmation).
> - **Re-import Protection**: Manually removed albums and tracks will be **permanently blacklisted** in persistent storage so automated online catalog queries, full discography pulls, or background syncs will never re-import them.
> - **Audit Disambiguation Fine-Tuning**: Priority is placed on **Basque lyrics and orthography checks** (character cluster scoring: *tx*, *tz*, *ts*, *lh*, *ñ*, *-tegi*, *-keta*, *-tasun*, *-ari*, Basque stopwords) paired with **genre conflict filters** (rejection of Regional Mexican, Sertanejo, Funk Carioca, Brazilian Trap, K-Pop, etc. sharing homonym artist names).

---

## 1. Overview & Core Concept

While automated disambiguation heuristics catch the vast majority of homonym mix-ups, real-world music catalog aggregators (such as Deezer, iTunes, and YouTube Music) occasionally cluster completely distinct artists under identical monikers. This feature empowers users to:
1. Review, select, and remove any album or single track—even when initially evaluated as "Verified Authentic"—without UI locks.
2. Remove individual tracks from within an album or compilation without deleting the entire release.
3. Remove unwanted tracks or albums immediately on the artist page via intuitive contextual actions.
4. Permanently tombstone/blacklist removed titles per artist so subsequent automated catalog pulls never re-pollute the catalog.
5. Benefit from fine-tuned linguistic analysis (phonotactic Basque cluster analysis and genre conflict rejection) during automatic audits.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Audit Modal Removal Flow**:
   - The user opens "Check Discography" (`/artist/[id]`).
   - The modal lists all albums categorized by status (Authentic, Flagged Foreign, Missing Online).
   - All items have interactive multi-select checkboxes.
   - Expanding an album displays the tracklist, where **each individual song** has its own checkbox and status indicator.
   - The user can select individual songs or full albums to remove, whether flagged or authentic.
   - The footer dynamically tallies: `"X songs to remove"`, `"Y albums to remove"`, `"Z to import"`, and the primary "Apply Changes" button remains active whenever any items are selected (even if `hasIssues === false`).
   - On confirmation, the changes are written to the database, entries are blacklisted, and the artist page refreshes in place.

2. **Direct Artist Page Quick-Removal Flow**:
   - On `/artist/[id]`, each album header and track row features an accessible context action menu or quick-remove trigger (styled with an unboxed trash/ban icon `hover:text-red-400`).
   - Clicking triggers an inline confirmation dialog: *"Remove '[Song/Album Title]' from [Artist]? This will also prevent it from being re-imported in future catalog scans."*
   - On confirmation, the item is removed and added to the artist's permanent blacklist with an immediate toast notification.

3. **Fine-Tuned Audit Insights**:
   - The audit engine displays clear, human-readable rationales in natural prose (e.g. *"Matches Basque orthography clusters (tx, tz, -tegi)"* vs. *"Flagged: Foreign genre conflict (Música Mexicana / Corridos) on homonym artist"*).

### Visual Identity & Theme
- **Aesthetic Direction**: Clean, dark-mode audio client conforming to the *Mobile & Touch-First* and *Universal Frontend Design* guidelines. Unboxed text metadata with `·` separators, single-line labels, and high-contrast accessibility.
- **Palette & Tokens**:
  - Dominant Neutral: `#0c0d12` (canvas) with `rgba(255, 255, 255, 0.04)` structural cards.
  - Accent: `#22c55e` (vibrant emerald brand green) for positive status and primary CTAs.
  - Caution/Conflict: `#f59e0b` (amber) for suspected homonyms.
  - Destructive: `#ef4444` (crimson red) for verified removals and blacklist markers.
- **Touch & Ergonomics**:
  - Touch target hitboxes $\ge 44 \times 44\text{px}$ across all mobile buttons, checkboxes, and row actions.
  - Expandable tracklists with smooth, GPU-accelerated transitions.

---

## 3. Key Product Decisions & Trade-Offs

- **Blacklist Persistence Strategy**:
  - *Decision*: Store blacklisted entities in an indexed `artist_exclusions` table (or dedicated persistent settings namespace with atomic operations) containing `artistId`, `artistName`, `entityType` (`album` | `track`), `normalizedTitle`, and `timestamp`.
  - *Why*: Prevents recurring background syncs, `loadFullDiscography` queries, and search sync from ever re-inserting removed songs.
  - *Alternative Considered*: In-memory session filters were rejected because page refreshes or external API calls would re-contaminate the database.

- **Song-Level Granularity**:
  - *Decision*: Allow removing individual songs from albums without deleting the entire album record. If all songs of an album are removed, the album shell is pruned automatically.
  - *Why*: Many Basque compilations or split releases feature tracks by multiple artists where only 1 or 2 tracks belong to the artist in question.

- **Non-Blocking UI for Authentic Items**:
  - *Decision*: Decouple the "Apply Changes" button state from `auditData.hasIssues`. Enable the submit button whenever `selectedIds.size > 0` or `selectedTrackIds.size > 0`.
  - *Why*: Fixes the issue where users couldn't apply changes to artists with 0 flagged issues.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT / UI LAYER                               │
├───────────────────────────────────┬────────────────────────────────────┤
│         Artist Page View          │         ArtistAuditModal           │
│      (/artist/[id]/page.tsx)      │   (components/artist-audit-modal)  │
│  - Quick-remove track/album action│   - Multi-select tabs              │
│  - Optimistic removal state       │   - Per-album & per-song checks    │
│  - Dynamic toast confirmation     │   - Authentic items selectable     │
└─────────────────┬─────────────────┴─────────────────┬──────────────────┘
                  │                                   │
                  ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        API ROUTE HANDLERS                              │
├────────────────────────────────────────────────────────────────────────┤
│  POST /api/artist/[id]/audit-discography                               │
│  - Accepts: { removeAlbumIds, removeTrackIds, importAlbumTitles }      │
│  - Records persistent exclusions into artist blacklist table           │
│  - Cascades track/album deletions from PostgreSQL                      │
│                                                                        │
│  POST /api/artist/[id]/exclude (or DELETE /api/tracks/[id])            │
│  - Quick direct removal and blacklisting of single album or track      │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      SERVICE / ENGINE LAYER                            │
├─────────────────────────────────┬──────────────────────────────────────┤
│       artist-audit.ts           │           sources/online.ts          │
│  - auditArtistDiscography()     │  - isValidMatchForArtist()           │
│  - applyArtistAuditChanges()    │  - isExcludedByBlacklist() check     │
│  - getArtistBlacklist()         │  - Basque orthography analyzer       │
│  - recordExclusions()           │  - Foreign genre conflict matrix     │
└─────────────────────────────────┴──────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATABASE LAYER (PG)                             │
├────────────────────────────────────────────────────────────────────────┤
│  - artists, albums, tracks                                             │
│  - artist_exclusions (syncKey, artistId, artistName, entityType, title)│
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Persistence
1. **Exclusions Schema / Store**:
   - `artist_exclusions`:
     - `artistId`: integer (nullable for global name matches)
     - `artistName`: text (case-insensitive indexed)
     - `entityType`: text (`album` | `track`)
     - `title`: text (original title)
     - `normalizedTitle`: text (lowercase, stripped punctuation, normalized accents)
     - `createdAt`: timestamp
2. **Exclusion Check Hook in Ingestion Pipeline**:
   - Before inserting any track or album in `persistMatch`, `loadFullDiscography`, or `searchOnlineTracks`, query the exclusion registry. If `isExcludedByBlacklist(artistName, itemTitle, type) === true`, the item is discarded immediately.

### Linguistic Disambiguation Fine-Tuning
- **Basque Orthography Scoring**:
  - Distinctive Basque phonemes and bigrams: `tx`, `tz`, `ts`, `lh`, `ñ`, `tt`, `dd`.
  - Common Basque grammatical morphemes/suffixes: `-tegi`, `-keta`, `-tasun`, `-gune`, `-mendi`, `-zale`, `-lari`, `-aren`, `-ekin`, `-etan`, `-gatik`, `-koa`.
  - High-frequency Basque function words: `eta`, `ez`, `ere`, `bat`, `hau`, `hori`, `hura`, `gu`, `zu`, `dira`, `ditu`, `ziren`, `naiz`, `zen`.
- **Genre Conflict Matrix**:
  - Rejection filters for genres incompatible with the Basque catalog for homonym artists: `corridos`, `sierreño`, `norteño`, `banda sinaloense`, `mariachi`, `sertanejo`, `funk carioca`, `pagode`, `forró`, `k-pop`, `trot`, `c-pop`.
  - Collaborator check: Rejection if featured artist or producer matches known foreign homonym networks without Basque ties.

---

## Verification & Acceptance Criteria
1. User can open the Audit modal on any artist (including those with 0 issues) and freely select any "Verified Authentic" album or individual song for removal.
2. Clicking "Apply Changes" deletes the selected items from the database and inserts corresponding blacklist records.
3. Reloading or re-running "Load Full Catalog" does not re-import the blacklisted albums or songs.
4. Direct removal actions on the artist page allow one-click deletion and blacklisting with instant UI feedback.
5. All 20 existing test suites continue to pass without regression.
6. Clean compilation (`next build`) and zero lint errors.
