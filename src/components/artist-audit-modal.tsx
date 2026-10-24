"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";
import { CoverArt } from "@/components/cover";
import { useToast } from "@/lib/toast";
import { useTranslation } from "@/lib/i18n";
import type { ArtistAuditResult, AuditAlbumItem } from "@/lib/artist-audit";

interface ArtistAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  artistId: number;
  artistName: string;
  onApplied: () => void;
}

export function ArtistAuditModal({
  isOpen,
  onClose,
  artistId,
  artistName,
  onApplied,
}: ArtistAuditModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [auditData, setAuditData] = useState<ArtistAuditResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(new Set());
  const [filterTab, setFilterTab] = useState<"all" | "flagged" | "missing" | "authentic">("all");

  useEffect(() => {
    let active = true;

    fetch(`/api/artist/${encodeURIComponent(artistId)}/audit-discography`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to audit discography");
        return r.json();
      })
      .then((data: ArtistAuditResult) => {
        if (!active) return;
        setAuditData(data);
        // Pre-select all recommended changes (flagged for removal or missing for import)
        const initialSelected = new Set<string | number>();
        const initialTracks = new Set<number>();
        for (const item of data.albums) {
          if (item.status === "flagged_foreign" || item.status === "missing_online") {
            initialSelected.add(item.id);
            if (item.trackIds) {
              for (const tid of item.trackIds) {
                initialTracks.add(tid);
              }
            }
          }
        }
        setSelectedIds(initialSelected);
        setSelectedTrackIds(initialTracks);
      })
      .catch((err) => {
        if (active) toast(err.message || "Audit failed", "⚠️");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [artistId, toast]);

  const items = useMemo(() => auditData?.albums || [], [auditData?.albums]);

  const filteredItems = useMemo(() => {
    if (filterTab === "flagged") {
      return items.filter((i) => i.status === "flagged_foreign");
    }
    if (filterTab === "missing") {
      return items.filter((i) => i.status === "missing_online");
    }
    if (filterTab === "authentic") {
      return items.filter((i) => i.status === "authentic");
    }
    return items;
  }, [items, filterTab]);

  const toggleSelect = (id: string | number) => {
    const item = items.find((i) => i.id === id);
    const willSelect = !selectedIds.has(id);

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (willSelect) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

    if (item && item.trackIds) {
      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        for (const tid of item.trackIds!) {
          if (willSelect) {
            next.add(tid);
          } else {
            next.delete(tid);
          }
        }
        return next;
      });
    }
  };

  const toggleTrackSelect = (trackId: number, parentAlbumId: string | number) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const toggleExpand = (id: string | number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllRecommended = () => {
    const nextIds = new Set<string | number>();
    const nextTracks = new Set<number>();
    for (const item of items) {
      if (item.status === "flagged_foreign" || item.status === "missing_online") {
        nextIds.add(item.id);
        if (item.trackIds) {
          for (const tid of item.trackIds) {
            nextTracks.add(tid);
          }
        }
      }
    }
    setSelectedIds(nextIds);
    setSelectedTrackIds(nextTracks);
  };

  const selectAll = () => {
    const nextIds = new Set<string | number>();
    const nextTracks = new Set<number>();
    for (const item of items) {
      nextIds.add(item.id);
      if (item.trackIds) {
        for (const tid of item.trackIds) {
          nextTracks.add(tid);
        }
      }
    }
    setSelectedIds(nextIds);
    setSelectedTrackIds(nextTracks);
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
    setSelectedTrackIds(new Set());
  };

  // Determine what would be removed and what would be imported
  const { toRemoveAlbums, standaloneTracksToRemove, toImport } = useMemo(() => {
    const remAlb: AuditAlbumItem[] = [];
    const imp: AuditAlbumItem[] = [];
    const remAlbIds = new Set<string | number>();

    for (const item of items) {
      if (selectedIds.has(item.id)) {
        if (item.status === "flagged_foreign" || item.status === "authentic") {
          remAlb.push(item);
          remAlbIds.add(item.id);
        } else if (item.status === "missing_online") {
          imp.push(item);
        }
      }
    }

    // Individual tracks to remove whose parent album is NOT already selected for removal
    const standaloneTrackIds: number[] = [];
    for (const tid of selectedTrackIds) {
      const parentAlb = items.find((i) => i.trackIds && i.trackIds.includes(tid));
      if (!parentAlb || !remAlbIds.has(parentAlb.id)) {
        standaloneTrackIds.push(tid);
      }
    }

    return {
      toRemoveAlbums: remAlb,
      standaloneTracksToRemove: standaloneTrackIds,
      toImport: imp,
    };
  }, [items, selectedIds, selectedTrackIds]);

  const hasChanges = toRemoveAlbums.length > 0 || standaloneTracksToRemove.length > 0 || toImport.length > 0;

  const handleApply = async () => {
    if (!hasChanges) return;
    setApplying(true);

    const removeAlbumIds: (number | string)[] = [];
    const removeTrackIds: number[] = [...standaloneTracksToRemove];
    const importAlbumTitles: string[] = [];

    for (const item of toRemoveAlbums) {
      if (item.id === "unassigned_flagged" || item.id === "unassigned_authentic") {
        if (item.trackIds) removeTrackIds.push(...item.trackIds);
      } else {
        removeAlbumIds.push(item.id);
      }
    }

    for (const item of toImport) {
      importAlbumTitles.push(item.title);
    }

    try {
      const res = await fetch(
        `/api/artist/${encodeURIComponent(artistId)}/audit-discography`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            removeAlbumIds,
            removeTrackIds,
            importAlbumTitles,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update discography");
      }

      const result = await res.json();
      toast(
        t("artist.changesAppliedToast", {
          removed: (result.removedAlbumsCount || removeAlbumIds.length) + (result.removedTracksCount ? 0 : removeTrackIds.length),
          imported: result.importedAlbumsCount || importAlbumTitles.length,
        }),
        "✅",
      );
      onApplied();
      onClose();
    } catch (err: any) {
      toast(err.message || "Failed to apply changes", "⚠️");
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#121216] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-accent/15 text-accent border border-accent/20">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 id="audit-modal-title" className="text-lg font-bold">
                {t("artist.auditModalTitle")}
              </h2>
              <p className="text-xs text-textdim mt-0.5">
                {t("artist.auditModalSubtitle", { artist: artistName })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={applying}
            aria-label={t("artist.close")}
            className="p-1.5 rounded-lg text-textdim hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content area */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 size={32} className="animate-spin text-accent mx-auto" />
              <p className="text-sm text-textdim">{t("artist.auditingCatalog")}</p>
            </div>
          ) : auditData ? (
            <>
              {/* Status Banner */}
              {!auditData.hasIssues ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-sm text-emerald-300">
                      {t("artist.auditCleanTitle")}
                    </h3>
                    <p className="text-xs text-emerald-200/80 mt-1 leading-relaxed">
                      {t("artist.auditCleanDesc", {
                        count: auditData.summary.totalAlbums,
                        artist: artistName,
                      })}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                  <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-sm text-amber-300">
                      {t("artist.auditIssuesTitle")}
                    </h3>
                    <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                      {t("artist.auditIssuesDesc", { artist: artistName })}
                    </p>
                  </div>
                </div>
              )}

              {/* Multi-select filter and batch controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-b border-white/5 pb-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
                  <button
                    onClick={() => setFilterTab("all")}
                    className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${
                      filterTab === "all"
                        ? "bg-white text-black"
                        : "bg-white/5 text-textdim hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {t("artist.filterAll")} ({items.length})
                  </button>
                  {auditData.summary.flaggedCount > 0 && (
                    <button
                      onClick={() => setFilterTab("flagged")}
                      className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${
                        filterTab === "flagged"
                          ? "bg-red-500 text-white"
                          : "bg-red-500/15 text-red-300 hover:bg-red-500/25"
                      }`}
                    >
                      {t("artist.filterFlagged")} ({auditData.summary.flaggedCount})
                    </button>
                  )}
                  {auditData.summary.missingCount > 0 && (
                    <button
                      onClick={() => setFilterTab("missing")}
                      className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${
                        filterTab === "missing"
                          ? "bg-blue-500 text-white"
                          : "bg-blue-500/15 text-blue-300 hover:bg-blue-500/25"
                      }`}
                    >
                      {t("artist.filterMissing")} ({auditData.summary.missingCount})
                    </button>
                  )}
                  <button
                    onClick={() => setFilterTab("authentic")}
                    className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${
                      filterTab === "authentic"
                        ? "bg-emerald-600 text-white"
                        : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                    }`}
                  >
                    {t("artist.filterAuthentic")} ({auditData.summary.authenticCount})
                  </button>
                </div>

                {/* Batch multi-select actions */}
                <div className="flex items-center gap-2 text-xs">
                  {auditData.hasIssues && (
                    <button
                      onClick={selectAllRecommended}
                      className="px-2.5 py-1 text-accent hover:underline font-semibold cursor-pointer"
                    >
                      {t("artist.selectAllRecommended")}
                    </button>
                  )}
                  <button
                    onClick={selectAll}
                    className="px-2.5 py-1 text-textdim hover:text-white transition cursor-pointer"
                  >
                    {t("artist.selectAll")}
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-2.5 py-1 text-textdim hover:text-white transition cursor-pointer"
                  >
                    {t("artist.deselectAll")}
                  </button>
                </div>
              </div>

              {/* Album items list with checkboxes */}
              <div className="space-y-2.5">
                {filteredItems.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  const isExpanded = expandedIds.has(item.id);

                  let badgeColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
                  let badgeIcon = <CheckCircle2 size={12} />;
                  let badgeText = t("artist.statusAuthentic");

                  if (item.status === "flagged_foreign") {
                    badgeColor = "bg-red-500/20 text-red-300 border-red-500/30";
                    badgeIcon = <AlertTriangle size={12} />;
                    badgeText = t("artist.statusFlagged");
                  } else if (item.status === "missing_online") {
                    badgeColor = "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
                    badgeIcon = <DownloadCloud size={12} />;
                    badgeText = t("artist.statusMissing");
                  }

                  return (
                    <div
                      key={item.id}
                      className={`border rounded-xl p-3 sm:p-3.5 transition ${
                        isSelected
                          ? item.status === "flagged_foreign"
                            ? "bg-red-950/20 border-red-500/40"
                            : item.status === "missing_online"
                            ? "bg-indigo-950/20 border-indigo-500/40"
                            : "bg-red-950/20 border-red-500/40"
                          : "bg-white/[0.03] border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleSelect(item.id)}
                          aria-label={`Toggle selection for ${item.title}`}
                          className="pt-1 text-accent hover:opacity-80 transition cursor-pointer shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare size={20} className={item.status === "authentic" ? "text-red-400" : "text-accent"} />
                          ) : (
                            <Square size={20} className="text-textdim hover:text-white" />
                          )}
                        </button>

                        {/* Thumbnail */}
                        <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-white/5 border border-white/10">
                          <CoverArt
                            seed={`${item.title}-${artistName}`}
                            artwork={item.thumbnail}
                            label={item.title}
                            rounded="rounded-lg"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-bold text-sm truncate ${isSelected && item.status !== "missing_online" ? "line-through text-red-200" : ""}`}>
                              {item.title}
                            </span>
                            {item.year ? (
                              <span className="text-xs text-textdim font-mono">({item.year})</span>
                            ) : null}
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeColor}`}
                            >
                              {badgeIcon}
                              <span>{badgeText}</span>
                            </span>
                            {item.status === "authentic" && isSelected && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-red-500/20 text-red-300 border-red-500/30">
                                <AlertTriangle size={10} />
                                <span>{t("artist.manualRemovalBadge")}</span>
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-textdim mt-1 leading-snug">
                            {item.reason}
                          </p>

                          <div className="flex items-center justify-between mt-2 pt-1">
                            <span className="text-xs text-textdim font-mono">
                              {item.trackCount} {item.trackCount === 1 ? t("common.songSingular") : t("common.songs")}
                            </span>

                            {(item.tracks.length > 0 || (item.trackItems && item.trackItems.length > 0)) && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(item.id)}
                                className="flex items-center gap-1 text-xs text-accent hover:underline cursor-pointer"
                              >
                                <span>
                                  {isExpanded
                                    ? t("artist.hideTracks")
                                    : t("artist.viewTracks", { count: item.trackItems?.length || item.tracks.length })}
                                </span>
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expandable track list with per-song checkboxes */}
                      {isExpanded && (item.trackItems?.length || item.tracks.length) > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10 pl-2 sm:pl-9 pr-2 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] text-textdim pb-1">
                            <span>{t("artist.individualTracks")}</span>
                            <span className="text-[10px] opacity-75">{t("artist.blacklistedTooltip")}</span>
                          </div>
                          {item.trackItems && item.trackItems.length > 0 ? (
                            item.trackItems.map((track) => {
                              const isTrackSelected = selectedTrackIds.has(track.id) || isSelected;
                              return (
                                <div
                                  key={track.id}
                                  className={`flex items-center justify-between gap-2 p-1.5 rounded-lg text-xs transition ${
                                    isTrackSelected ? "bg-red-950/30 text-white" : "hover:bg-white/5 text-textdim"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleTrackSelect(track.id, item.id)}
                                      aria-label={`Toggle track ${track.title}`}
                                      className="text-accent hover:opacity-80 transition cursor-pointer shrink-0"
                                    >
                                      {isTrackSelected ? (
                                        <CheckSquare size={16} className="text-red-400" />
                                      ) : (
                                        <Square size={16} className="text-textdim hover:text-white" />
                                      )}
                                    </button>
                                    <span className={`truncate ${isTrackSelected ? "line-through text-red-200" : "text-white/90"}`}>
                                      {track.title}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isTrackSelected && (
                                      <span className="text-[10px] font-semibold text-red-400">
                                        {t("artist.manualRemovalBadge")}
                                      </span>
                                    )}
                                    {track.status === "flagged_foreign" && !isTrackSelected && (
                                      <span className="text-[10px] font-medium text-amber-400 flex items-center gap-1">
                                        <AlertTriangle size={10} />
                                        <span>{t("artist.statusFlagged")}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <ol className="space-y-1 text-xs text-textdim list-decimal list-inside">
                              {item.tracks.map((trackTitle, idx) => (
                                <li key={idx} className="truncate text-white/90">
                                  {trackTitle}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer with Actions */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-black/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-textdim">
            {hasChanges ? (
              <span className="font-medium text-white flex flex-wrap items-center gap-2">
                {toRemoveAlbums.length > 0 && (
                  <span className="text-red-400">
                    {t("artist.selectedAlbumsCount", { count: toRemoveAlbums.length })}
                  </span>
                )}
                {standaloneTracksToRemove.length > 0 && (
                  <span className="text-amber-400">
                    {t("artist.selectedSongsCount", { count: standaloneTracksToRemove.length })}
                  </span>
                )}
                {toImport.length > 0 && (
                  <span className="text-indigo-400">
                    {toImport.length} {t("artist.filterMissing")}
                  </span>
                )}
              </span>
            ) : (
              <span>{t("artist.noChangesSelected")}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={applying}
              className="px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 transition cursor-pointer disabled:opacity-50"
            >
              {t("artist.close")}
            </button>

            {hasChanges && (
              <button
                onClick={handleApply}
                disabled={applying || !hasChanges}
                className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold bg-accent text-black hover:scale-105 active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:scale-100"
              >
                {applying ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>{t("artist.applyingChanges")}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>
                      {t("artist.applyChanges", {
                        count: toRemoveAlbums.length + standaloneTracksToRemove.length + toImport.length,
                      })}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
