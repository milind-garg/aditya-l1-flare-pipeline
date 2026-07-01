import { useState, useMemo } from "react";
import type { FlareEvent } from "../api/client";

interface CatalogueViewProps {
  flares: FlareEvent[];
  isLoading: boolean;
  onFlareSelect?: (flare: FlareEvent) => void;
}

type SortField = "id" | "start" | "peak" | "end" | "class" | "peak_value" | "source" | "confidence";

const PAGE_SIZE = 15;

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}:${s} UTC`;
}

function formatScientific(value: number): string {
  const exp = value.toExponential(2);
  const parts = exp.split("e");
  const mantissa = parts[0];
  const exponent = parts[1].replace("+", "");
  return `${mantissa} × 10<sup>${exponent}</sup> W/m²`;
}

function formatConfidence(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

const SOURCE_LABELS: Record<string, string> = {
  "soft+hard": "Soft+Hard",
  hard_only: "Hard Only",
  soft_only: "Soft Only",
};

function sourceLabel(src: string): string {
  return SOURCE_LABELS[src] || src;
}

function classBadge(flareClass: string) {
  const letter = (flareClass?.charAt(0) || "").toUpperCase();
  let badgeClass: string;
  let label: string;

  if (letter === "A" || letter === "B") {
    badgeClass = "bg-outline text-surface";
    label = `${letter}-Class (${flareClass})`;
  } else if (letter === "C") {
    badgeClass = "bg-yellow-400 text-on-primary-fixed";
    label = `C-Class (${flareClass})`;
  } else if (letter === "M") {
    badgeClass = "bg-amber-500 text-on-primary-fixed";
    label = `M-Class (${flareClass})`;
  } else if (letter === "X") {
    badgeClass = "bg-error text-on-error";
    label = `X-Class (${flareClass})`;
  } else {
    badgeClass = "bg-outline text-surface";
    label = flareClass || "N/A";
  }

  return (
    <span className={`${badgeClass} px-2 py-0.5 rounded-sm font-bold text-[9px] uppercase tracking-tighter`}>
      {label}
    </span>
  );
}

function sourceTag(src: string) {
  if (src === "hard_only") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider"
        style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.5)", color: "#fb923c" }}
        title="Hard X-ray burst with no soft counterpart — likely a non-thermal electron beam event preceding a thermal flare"
      >
        <span>&#x26A1;</span> Precursor
      </span>
    );
  }
  if (src === "soft+hard") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] uppercase tracking-wider"
        style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}
      >
        Soft+Hard
      </span>
    );
  }
  return (
    <span className="border border-outline-variant/30 text-on-surface-variant px-1.5 py-0.5 rounded text-[9px] uppercase">
      {sourceLabel(src)}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-outline-variant/10">
      <td className="px-6 py-4"><div className="h-4 w-28 rounded bg-surface-variant/40 animate-pulse" /></td>
      <td className="px-6 py-4"><div className="h-4 w-20 rounded bg-surface-variant/40 animate-pulse" /></td>
      <td className="px-6 py-4"><div className="h-4 w-20 rounded bg-surface-variant/40 animate-pulse" /></td>
      <td className="px-6 py-4"><div className="h-4 w-20 rounded bg-surface-variant/40 animate-pulse" /></td>
      <td className="px-6 py-4"><div className="h-5 w-24 rounded bg-surface-variant/40 animate-pulse" /></td>
      <td className="px-6 py-4"><div className="h-4 w-28 rounded bg-surface-variant/40 animate-pulse" /></td>
      <td className="px-6 py-4"><div className="h-4 w-16 rounded bg-surface-variant/40 animate-pulse" /></td>
      <td className="px-6 py-4 text-right"><div className="h-4 w-12 rounded bg-surface-variant/40 animate-pulse ml-auto" /></td>
    </tr>
  );
}

export default function CatalogueView({ flares, isLoading, onFlareSelect }: CatalogueViewProps) {
  const [sortField, setSortField] = useState<SortField>("peak");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchFilter, setSearchFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterClass, setFilterClass] = useState("ALL");
  const [filterSource, setFilterSource] = useState("ALL");
  const [minConfidence, setMinConfidence] = useState<number>(0);

  const classCounts = useMemo(() => {
    let c = 0, m = 0, x = 0, precursor = 0;
    for (const f of flares) {
      const letter = f.class?.charAt(0).toUpperCase();
      if (letter === "C") c++;
      else if (letter === "M") m++;
      else if (letter === "X") x++;
      if (f.source === "hard_only") precursor++;
    }
    return { c, m, x, precursor };
  }, [flares]);

  const filtered = useMemo(() => {
    let result = flares;

    if (minConfidence > 0) {
      result = result.filter((f) => f.confidence >= minConfidence);
    }
    if (filterClass !== "ALL") {
      result = result.filter((f) => {
        if (filterClass === "N/A") return !f.class;
        return f.class?.toUpperCase().startsWith(filterClass);
      });
    }
    if (filterSource !== "ALL") {
      result = result.filter((f) => f.source === filterSource);
    }

    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      result = result.filter(
        (f) =>
          f.id.toLowerCase().includes(q) ||
          f.class?.toLowerCase().includes(q) ||
          f.source?.toLowerCase().includes(q) ||
          (q === "precursor" && f.source === "hard_only")
      );
    }
    return result;
  }, [flares, searchFilter, minConfidence, filterClass, filterSource]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      let cmp: number;
      if (typeof aVal === "string") {
        cmp = (aVal as string).localeCompare(bVal as string);
      } else {
        cmp = (aVal as number) - (bVal as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, safePage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const handleSearch = (val: string) => {
    setSearchFilter(val);
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    if (sorted.length === 0) return;
    
    const headers = ["Event ID", "Start Time (UTC)", "Peak Time (UTC)", "End Time (UTC)", "Class", "Peak Flux (W/m2)", "Source", "Confidence"];
    
    const rows = sorted.map(f => {
      return [
        f.id,
        f.start,
        f.peak,
        f.end,
        f.class || "N/A",
        f.peak_value,
        f.source,
        f.confidence
      ].join(",");
    });
    
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `flare_catalogue.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sortArrow = (field: SortField) => {
    if (field !== sortField) return null;
    return (
      <span className="material-symbols-outlined text-[12px] inline-block transition-transform" style={{ transform: sortDir === "asc" ? "rotate(180deg)" : "rotate(0deg)" }}>
        expand_more
      </span>
    );
  };

  const sortableTh = (field: SortField, label: string, classes = "") => (
    <th className={`px-6 py-4 font-bold tracking-widest cursor-pointer hover:text-on-surface transition-colors ${classes}`} onClick={() => handleSort(field)}>
      <div className="flex items-center gap-1 uppercase">
        {label}
        {sortArrow(field)}
      </div>
    </th>
  );

  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, sorted.length);

  return (
        <main className="flex-1 h-full p-margin-page overflow-y-auto">
          {/* Header */}
          <header className="mb-8">
            <h1 className="font-display-lg text-display-lg text-on-surface">Detected Flare Events</h1>
            <p className="text-on-surface-variant font-mono-sm mt-1">
              {isLoading ? "Loading events..." : `${flares.length} events detected across observation window`}
            </p>
          </header>

          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter mb-8">
            {/* Total Events */}
            <div className="bg-primary-container p-container-padding border border-outline-variant/15 rounded-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-6xl">list_alt</span>
              </div>
              <p className="font-label-caps text-label-caps text-on-surface-variant mb-2">Total Events</p>
              <div className="flex items-baseline gap-2">
                <span className="font-data-lg text-display-lg text-primary">
                  {isLoading ? "\u2014" : flares.length}
                </span>
              </div>
            </div>
            {/* M-Class */}
            <div className="bg-primary-container p-container-padding border border-outline-variant/15 rounded-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 opacity-5 pointer-events-none text-amber-500">
                <span className="material-symbols-outlined text-6xl">warning</span>
              </div>
              <p className="font-label-caps text-label-caps text-on-surface-variant mb-2">M-Class</p>
              <div className="flex items-baseline gap-2">
                <span className="font-data-lg text-display-lg text-amber-500">
                  {isLoading ? "\u2014" : classCounts.m}
                </span>
                {!isLoading && <span className="text-xs text-on-surface-variant font-mono">Vigilance Required</span>}
              </div>
            </div>
            {/* C-Class */}
            <div className="bg-primary-container p-container-padding border border-outline-variant/15 rounded-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 opacity-5 pointer-events-none text-yellow-400">
                <span className="material-symbols-outlined text-6xl">flare</span>
              </div>
              <p className="font-label-caps text-label-caps text-on-surface-variant mb-2">C-Class</p>
              <div className="flex items-baseline gap-2">
                <span className="font-data-lg text-display-lg text-yellow-400">
                  {isLoading ? "\u2014" : classCounts.c}
                </span>
                {!isLoading && <span className="text-xs text-on-surface-variant font-mono">Nominal</span>}
              </div>
            </div>
            {/* X-Class */}
            <div className="bg-primary-container p-container-padding border border-outline-variant/15 rounded-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 opacity-5 pointer-events-none text-error">
                <span className="material-symbols-outlined text-6xl">warning</span>
              </div>
              <p className="font-label-caps text-label-caps text-on-surface-variant mb-2">X-Class</p>
              <div className="flex items-baseline gap-2">
                <span className="font-data-lg text-display-lg text-error">
                  {isLoading ? "\u2014" : classCounts.x}
                </span>
                {!isLoading && <span className="text-xs text-on-surface-variant font-mono">Critical</span>}
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-primary-container border border-outline-variant/15 rounded-lg flex flex-col">
            {/* Table Header Actions */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-outline-variant/15">
              <div className="flex gap-4">
                <div className="relative flex items-center">
                  <input
                    className="bg-background border border-outline-variant/30 rounded px-3 py-1.5 font-label-caps text-[10px] w-64 focus:outline-none focus:border-primary text-on-surface placeholder:text-on-surface-variant/50"
                    placeholder="FILTER EVENT ID..."
                    type="text"
                    value={searchFilter}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>
                <button 
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className={`border px-4 py-1.5 rounded font-label-caps text-[10px] flex items-center gap-2 transition-colors ${showAdvanced ? "bg-white/10 border-outline-variant text-on-surface" : "border-outline-variant/30 hover:bg-white/5"}`}
                >
                  <span className="material-symbols-outlined text-sm">filter_list</span>
                  ADVANCED FILTER
                </button>
              </div>
              <button 
                onClick={handleExportCSV}
                className="border border-primary/50 text-primary px-4 py-1.5 rounded font-label-caps text-[10px] flex items-center gap-2 hover:bg-primary/10 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                EXPORT CSV
              </button>
            </div>

            {showAdvanced && (
              <div className="px-6 py-4 border-b border-outline-variant/15 bg-black/20 flex gap-8 items-center text-[10px] font-label-caps text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <span>CLASS:</span>
                  <select 
                    className="bg-background border border-outline-variant/30 rounded px-2 py-1 text-on-surface focus:outline-none"
                    value={filterClass}
                    onChange={e => setFilterClass(e.target.value)}
                  >
                    <option value="ALL">All</option>
                    <option value="X">X-Class</option>
                    <option value="M">M-Class</option>
                    <option value="C">C-Class</option>
                    <option value="B">B-Class</option>
                    <option value="N/A">N/A (Precursor)</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span>SOURCE:</span>
                  <select 
                    className="bg-background border border-outline-variant/30 rounded px-2 py-1 text-on-surface focus:outline-none"
                    value={filterSource}
                    onChange={e => setFilterSource(e.target.value)}
                  >
                    <option value="ALL">All</option>
                    <option value="soft_only">Soft Only</option>
                    <option value="hard_only">Hard Only</option>
                    <option value="soft+hard">Soft + Hard</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span>MIN CONFIDENCE:</span>
                  <select 
                    className="bg-background border border-outline-variant/30 rounded px-2 py-1 text-on-surface focus:outline-none"
                    value={minConfidence}
                    onChange={e => setMinConfidence(Number(e.target.value))}
                  >
                    <option value={0}>0%</option>
                    <option value={0.5}>&gt; 50%</option>
                    <option value={0.75}>&gt; 75%</option>
                    <option value={0.9}>&gt; 90%</option>
                  </select>
                </div>
                <div className="ml-auto">
                  <button 
                    onClick={() => { setFilterClass("ALL"); setFilterSource("ALL"); setMinConfidence(0); }}
                    className="hover:text-primary transition-colors underline"
                  >
                    RESET FILTERS
                  </button>
                </div>
              </div>
            )}

            {/* The Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="font-label-caps text-[10px] text-on-surface-variant border-b border-outline-variant/15 bg-surface-container-low">
                    {sortableTh("id", "Event ID")}
                    {sortableTh("start", "Start Time (UTC)")}
                    {sortableTh("peak", "Peak Time (UTC)")}
                    {sortableTh("end", "End Time (UTC)")}
                    {sortableTh("class", "Class")}
                    {sortableTh("peak_value", "Peak Flux")}
                    {sortableTh("source", "Source")}
                    <th className="px-6 py-4 font-bold tracking-widest text-right cursor-pointer hover:text-on-surface transition-colors" onClick={() => handleSort("confidence")}>
                      <div className="flex items-center gap-1 justify-end uppercase">
                        Confidence
                        {sortArrow("confidence")}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono-sm text-on-surface text-xs">
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-on-surface-variant font-label-caps text-label-caps">
                        {searchFilter
                          ? "No flares match your search filter"
                          : "No flares detected in this time range"}
                      </td>
                    </tr>
                  ) : (
                    paginated.map((flare) => (
                      <tr
                        key={flare.id}
                        className="border-b border-outline-variant/10 hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => onFlareSelect?.(flare)}
                      >
                        <td className="px-6 py-4 text-primary font-medium tracking-tight">{flare.id}</td>
                        <td className="px-6 py-4 text-on-surface-variant">{formatTimestamp(flare.start)}</td>
                        <td className="px-6 py-4">{formatTimestamp(flare.peak)}</td>
                        <td className="px-6 py-4 text-on-surface-variant">{formatTimestamp(flare.end)}</td>
                        <td className="px-6 py-4">{classBadge(flare.class)}</td>
                        <td className="px-6 py-4" dangerouslySetInnerHTML={{ __html: formatScientific(flare.peak_value) }} />
                        <td className="px-6 py-4">{sourceTag(flare.source)}</td>
                        <td className="px-6 py-4 text-right font-bold" style={{ color: flare.confidence > 0.7 ? "#facc15" : flare.confidence > 0.5 ? "#c7c6cc" : undefined }}>
                          {formatConfidence(flare.confidence)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 flex items-center justify-between border-t border-outline-variant/15 font-label-caps text-[10px]">
              <div className="text-on-surface-variant">
                SHOWING <span className="text-on-surface">{sorted.length === 0 ? "0" : `${rangeStart}-${rangeEnd}`}</span> OF{" "}
                <span className="text-on-surface">{sorted.length}</span> ENTRIES
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="w-8 h-8 flex items-center justify-center border border-outline-variant/30 text-on-surface-variant hover:bg-white/5 transition-colors rounded disabled:opacity-30"
                  disabled={safePage <= 1 || sorted.length === 0}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                <span className="px-3 text-on-surface-variant">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  className="w-8 h-8 flex items-center justify-center border border-outline-variant/30 text-on-surface-variant hover:bg-white/5 transition-colors rounded disabled:opacity-30"
                  disabled={safePage >= totalPages || sorted.length === 0}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          </div>

          {/* System Status Footer */}
          <div className="mt-8 flex justify-between items-center text-[10px] font-mono uppercase text-on-surface-variant opacity-60">
            <div className="flex items-center gap-4">
              <span>Buffer: 98.2%</span>
              <span>Latency: 4.2ms</span>
              <span>Sat Status: Tracking ADITYA-L1</span>
            </div>
            <div>Node: IND-BANGALORE-HUB-04</div>
          </div>
        </main>
  );
}
