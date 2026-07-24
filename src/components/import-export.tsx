"use client";

import { useState } from "react";
import { Download, Upload, FileText, FileCode, Check, Loader2 } from "lucide-react";
import { useToast } from "@/lib/toast";

export function ImportExportManager() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Export Playlists & Liked Songs as JSON or M3U
  const handleExport = async (format: "json" | "m3u") => {
    setExporting(true);
    try {
      const res = await fetch("/api/playlists");
      const data = await res.json();
      const playlists = data.playlists || [];

      if (format === "json") {
        const jsonStr = JSON.stringify(playlists, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `euskalsoinua_playlists_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast("Exported JSON successfully", "💾");
      } else if (format === "m3u") {
        let m3uContent = "#EXTM3U\n";
        for (const pl of playlists) {
          m3uContent += `#PLAYLIST:${pl.name}\n`;
          if (pl.tracks) {
            for (const t of pl.tracks) {
              m3uContent += `#EXTINF:${t.duration || 180},${t.artistName} - ${t.title}\n`;
              m3uContent += `${t.previewUrl || `https://youtube.com/watch?v=${t.externalId || ""}`}\n`;
            }
          }
        }
        const blob = new Blob([m3uContent], { type: "audio/x-mpegurl" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `euskalsoinua_export_${new Date().toISOString().slice(0, 10)}.m3u`;
        a.click();
        URL.revokeObjectURL(url);
        toast("Exported M3U playlist successfully", "🎵");
      }
    } catch (err) {
      toast("Failed to export playlists", "❌");
    } finally {
      setExporting(false);
    }
  };

  // Import JSON or M3U
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();

      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        const playlistsToImport = Array.isArray(parsed) ? parsed : [parsed];

        let successCount = 0;
        for (const item of playlistsToImport) {
          const res = await fetch("/api/playlists/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.name || "Imported Playlist",
              description: item.description || "Imported from file",
              tracksList: item.tracks || item.trackList || [],
            }),
          });
          if (res.ok) successCount++;
        }
        toast(`Imported ${successCount} playlist(s)!`, "🎉");
        window.dispatchEvent(new Event("playlists-changed"));
      } else if (file.name.endsWith(".m3u") || file.name.endsWith(".m3u8")) {
        // Parse M3U
        const lines = text.split("\n");
        const tracksList: { title: string; artistName: string }[] = [];
        let currentTitle = "Imported Track";
        let currentArtist = "Unknown Artist";

        for (const line of lines) {
          if (line.startsWith("#EXTINF:")) {
            const commaIdx = line.indexOf(",");
            if (commaIdx !== -1) {
              const meta = line.slice(commaIdx + 1);
              const parts = meta.split(" - ");
              if (parts.length >= 2) {
                currentArtist = parts[0].trim();
                currentTitle = parts.slice(1).join(" - ").trim();
              } else {
                currentTitle = meta.trim();
              }
            }
          } else if (line.trim() && !line.startsWith("#")) {
            tracksList.push({ title: currentTitle, artistName: currentArtist });
          }
        }

        if (tracksList.length > 0) {
          const res = await fetch("/api/playlists/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: file.name.replace(/\.[^/.]+$/, ""),
              description: "Imported from M3U playlist file",
              tracksList,
            }),
          });
          if (res.ok) {
            toast(`Imported ${tracksList.length} tracks from M3U!`, "🎉");
            window.dispatchEvent(new Event("playlists-changed"));
          } else {
            toast("M3U import failed", "❌");
          }
        }
      } else {
        toast("Unsupported file format (Use .json or .m3u)", "❌");
      }
    } catch (err) {
      toast("Error parsing import file", "❌");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="bg-bg-soft rounded-2xl border border-white/5 p-5 shadow-xl space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-accent/10 text-accent">
          <Download size={20} />
        </div>
        <div>
          <h3 className="text-base font-extrabold text-white">Import & Export Capabilities</h3>
          <p className="text-xs text-textdim">
            Backup your library or import playlists from JSON / M3U standard media files
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {/* Export Card */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-3">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <FileCode size={15} className="text-accent" /> Export Playlists
          </span>
          <p className="text-[11px] text-textdim">Download your full library as JSON or standard M3U playlists.</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport("json")}
              disabled={exporting}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} .JSON
            </button>
            <button
              onClick={() => handleExport("m3u")}
              disabled={exporting}
              className="flex-1 bg-accent/15 hover:bg-accent/25 text-accent font-bold py-2 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} .M3U
            </button>
          </div>
        </div>

        {/* Import Card */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-3">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Upload size={15} className="text-accent" /> Import File
          </span>
          <p className="text-[11px] text-textdim">Upload a .json or .m3u playlist file to import instantly.</p>
          <label className="w-full bg-accent text-black font-extrabold py-2.5 rounded-lg text-xs hover:scale-105 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-accent/15">
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Select File (.json / .m3u)
            <input
              type="file"
              accept=".json,.m3u,.m3u8"
              onChange={handleFileChange}
              disabled={importing}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
