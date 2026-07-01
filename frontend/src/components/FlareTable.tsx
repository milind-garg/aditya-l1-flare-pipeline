import { useState, useMemo } from "react";
import type { FlareEvent } from "../api/client";

interface Props {
  flares: FlareEvent[];
  onFlareClick?: (flare: FlareEvent) => void;
}

const CLASS_COLORS: Record<string, string> = {
  A: "#888",
  B: "#aaa",
  C: "#ffd700",
  M: "#ff8c00",
  X: "#ff4500",
};

const SOURCE_BADGES: Record<string, string> = {
  "soft+hard": "#00b894",
  soft_only: "#74b9ff",
  hard_only: "#fd79a8",
};

export default function FlareTable({ flares, onFlareClick }: Props) {
  const [sortField, setSortField] = useState<keyof FlareEvent>("peak");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterClass, setFilterClass] = useState<string>("all");

  const sorted = useMemo(() => {
    let filtered = flares;
    if (filterClass !== "all") {
      filtered = flares.filter((f) => f.class?.charAt(0) === filterClass);
    }
    return [...filtered].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [flares, sortField, sortDir, filterClass]);

  const handleSort = (field: keyof FlareEvent) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const formatTime = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 19);

  return (
    <div className="flare-table-container">
      <div className="table-controls">
        <h3>Flare Catalogue ({sorted.length} events)</h3>
        <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="filter-select">
          <option value="all">All Classes</option>
          <option value="A">A Class</option>
          <option value="B">B Class</option>
          <option value="C">C Class</option>
          <option value="M">M Class</option>
          <option value="X">X Class</option>
        </select>
      </div>
      <div className="table-wrapper">
        <table className="flare-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("id")}>ID</th>
              <th onClick={() => handleSort("start")}>Start</th>
              <th onClick={() => handleSort("peak")}>Peak</th>
              <th onClick={() => handleSort("end")}>End</th>
              <th onClick={() => handleSort("class")}>Class</th>
              <th onClick={() => handleSort("peak_value")}>Peak Value</th>
              <th onClick={() => handleSort("source")}>Source</th>
              <th onClick={() => handleSort("confidence")}>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((flare) => (
              <tr key={flare.id} onClick={() => onFlareClick?.(flare)} className="flare-row" title={`Click to view ${flare.id}`}>
                <td>{flare.id}</td>
                <td>{formatTime(flare.start)}</td>
                <td>{formatTime(flare.peak)}</td>
                <td>{formatTime(flare.end)}</td>
                <td>
                  <span className="class-badge" style={{ backgroundColor: CLASS_COLORS[flare.class?.charAt(0)] || "#888" }}>
                    {flare.class || "N/A"}
                  </span>
                </td>
                <td>{flare.peak_value.toExponential(2)}</td>
                <td>
                  <span className="source-badge" style={{ backgroundColor: SOURCE_BADGES[flare.source] || "#666" }}>
                    {flare.source}
                  </span>
                </td>
                <td>{(flare.confidence * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
