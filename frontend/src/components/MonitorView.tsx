import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { FlareEvent } from "../api/client";


interface GaugeForecast {
  probability_15min: number;
  probability_30min: number;
  alert_15min: boolean;
  alert_30min: boolean;
  lead_time_minutes?: number;
}

interface MonitorViewProps {
  timeSeries: { timestamp: string; soft: number; hard: number }[];
  flares: FlareEvent[];
  forecast: GaugeForecast;
  alertVisible: boolean;
  currentFlareClass?: string;
  replay: {
    isPlaying: boolean;
    speed: number;
    currentTime: string;
  };
  utcTime?: string;
  selectedFlarePeak?: string;
  timeRange: [string, string];
  onTimeRangeChange: (start: string, end: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onSpeedChange: (speed: number) => void;
}

const FLARE_CLASS_COLORS: Record<string, string> = {
  C: "#facc15",
  M: "#f97316",
  X: "#ef4444",
};

function getClassColor(flareClass: string): string {
  const letter = flareClass?.charAt(0)?.toUpperCase() || "";
  return FLARE_CLASS_COLORS[letter] || "#facc15";
}

export default function MonitorView({
  timeSeries,
  flares,
  forecast,
  alertVisible,
  currentFlareClass,
  replay,
  timeRange,
  onTimeRangeChange,
  utcTime: _utcTime,
  selectedFlarePeak: _selectedFlarePeak,
  onPlay,
  onPause,
  onSpeedChange,
}: MonitorViewProps) {

  const softData = timeSeries.map((d) => ({
    ts: new Date(d.timestamp).getTime(),
    value: d.soft,
  }));

  const hardData = timeSeries.map((d) => ({
    ts: new Date(d.timestamp).getTime(),
    value: d.hard,
  }));

  const softMax = softData.length > 0 ? Math.max(...softData.map((d) => d.value), 1) : 1;
  const hardMax = hardData.length > 0 ? Math.max(...hardData.map((d) => d.value), 1) : 1;

  const flareMarkers = flares
    .filter((f) => {
      const ft = new Date(f.peak).getTime();
      if (softData.length === 0) return false;
      const start = softData[0].ts;
      const end = softData[softData.length - 1].ts;
      return ft >= start && ft <= end;
    })
    .map((f) => ({
      x: new Date(f.peak).getTime(),
      label: f.class,
      color: getClassColor(f.class),
    }));

  const xtickFormat = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
  };

  const flareGradients = flares
    .filter((f) => {
      const ft = new Date(f.peak).getTime();
      if (softData.length === 0) return false;
      const start = softData[0].ts;
      const end = softData[softData.length - 1].ts;
      return ft >= start && ft <= end;
    })
    .map((f) => {
      const peak = new Date(f.peak).getTime();
      const halfWindow = 30000;
      const leftPct =
        softData.length > 1
          ? ((peak - halfWindow - softData[0].ts) / (softData[softData.length - 1].ts - softData[0].ts)) * 100
          : 0;
      const widthPct =
        softData.length > 1
          ? ((halfWindow * 2) / (softData[softData.length - 1].ts - softData[0].ts)) * 100
          : 0;
      return {
        left: Math.max(0, leftPct),
        width: Math.min(widthPct, 100 - Math.max(0, leftPct)),
        color: getClassColor(f.class),
      };
    })
    .filter((g) => g.width > 0);

  // Calculate timeline progress
  const startMs = new Date(timeRange[0]).getTime();
  const endMs = new Date(timeRange[1]).getTime();
  const currentMs = replay.currentTime ? new Date(replay.currentTime).getTime() : startMs;
  let progressPct = 0;
  if (endMs > startMs) {
    progressPct = Math.min(100, Math.max(0, ((currentMs - startMs) / (endMs - startMs)) * 100));
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ backgroundColor: "#0a0e1a" }}>
          {/* Alert Banner */}
          {alertVisible && (
            <div className="w-full bg-solar-amber/20 border-y border-solar-amber/30 px-6 py-3 flex items-center justify-center gap-4 glow-amber shrink-0">
              <span className="material-symbols-outlined text-solar-amber animate-pulse">warning</span>
              <p className="text-solar-amber font-label-caps text-label-caps tracking-widest text-center">
                FLARE ALERT &mdash;{" "}
                {currentFlareClass || "C4.2"} class flare predicted in next 12 minutes &mdash;{" "}
                {(Math.max(forecast.probability_15min, forecast.probability_30min) * 100).toFixed(0)}% confidence
              </p>
              <span className="material-symbols-outlined text-solar-amber animate-pulse">warning</span>
            </div>
          )}

          {/* Two-column layout with charts + sidebar */}
          <div className="flex-1 flex p-gutter gap-gutter overflow-hidden">
            {/* Left: Chart panel (70%) */}
            <section className="w-[70%] flex flex-col gap-gutter overflow-hidden">
              {/* Top chart: SoLEXS */}
              <div className="flex-1 glass-panel rounded-lg p-container-padding flex flex-col relative min-h-0">
                <div className="flex justify-between items-center mb-2 px-2 shrink-0">
                  <span className="text-label-caps text-sky-400 font-bold">SOFT X-RAY (SOLEXS)</span>
                  <div className="flex gap-4 text-[10px] text-on-surface-variant">
                    <span>0.1-0.8 nm</span>
                    <span>Scale: Logarithmic</span>
                  </div>
                </div>
                <div className="flex-1 relative min-h-0">
                  {/* Flare gradient overlays */}
                  {flareGradients.map((g, i) => (
                    <div
                      key={i}
                      className="absolute h-full border-x pointer-events-none"
                      style={{
                        left: `${g.left}%`,
                        width: `${g.width}%`,
                        background: `linear-gradient(to bottom, transparent, ${g.color}26, transparent)`,
                        borderColor: `${g.color}33`,
                      }}
                    />
                  ))}
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={softData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#46464c" opacity={0.3} />
                      <XAxis
                        dataKey="ts"
                        type="number"
                        domain={softData.length > 1 ? [softData[0].ts, softData[softData.length - 1].ts] : ["auto", "auto"]}
                        tick={{ fill: "#c7c6cc", fontSize: 10, fontFamily: "JetBrains Mono" }}
                        tickFormatter={xtickFormat}
                        tickLine={false}
                        axisLine={{ stroke: "#46464c", opacity: 0.3 }}
                      />
                      <YAxis
                        domain={[0, softMax * 1.1]}
                        tick={{ fill: "#c7c6cc", fontSize: 10, fontFamily: "JetBrains Mono" }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#1c1b1c",
                          border: "1px solid #46464c",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontFamily: "JetBrains Mono",
                        }}
                        labelFormatter={(v) => new Date(v as number).toISOString()}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#38bdf8"
                        fill="#38bdf8"
                        fillOpacity={0.1}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      {flareMarkers.map((fm, i) => (
                        <ReferenceLine key={i} x={fm.x} stroke={fm.color} strokeDasharray="4 4" strokeWidth={2} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bottom chart: HEL1OS */}
              <div className="flex-1 glass-panel rounded-lg p-container-padding flex flex-col relative min-h-0">
                <div className="flex justify-between items-center mb-2 px-2 shrink-0">
                  <span className="text-label-caps text-flare-m font-bold">HARD X-RAY (HEL1OS)</span>
                  <div className="flex gap-4 text-[10px] text-on-surface-variant">
                    <span>10-150 keV</span>
                    <span>Sampling: 1s</span>
                  </div>
                </div>
                <div className="flex-1 relative min-h-0">
                  {flareGradients.map((g, i) => (
                    <div
                      key={i}
                      className="absolute h-full border-x pointer-events-none"
                      style={{
                        left: `${g.left}%`,
                        width: `${g.width}%`,
                        background: `linear-gradient(to bottom, transparent, ${g.color}26, transparent)`,
                        borderColor: `${g.color}33`,
                      }}
                    />
                  ))}
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hardData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#46464c" opacity={0.3} />
                      <XAxis
                        dataKey="ts"
                        type="number"
                        domain={hardData.length > 1 ? [hardData[0].ts, hardData[hardData.length - 1].ts] : ["auto", "auto"]}
                        tick={{ fill: "#c7c6cc", fontSize: 10, fontFamily: "JetBrains Mono" }}
                        tickFormatter={xtickFormat}
                        tickLine={false}
                        axisLine={{ stroke: "#46464c", opacity: 0.3 }}
                      />
                      <YAxis
                        domain={[0, hardMax * 1.1]}
                        tick={{ fill: "#c7c6cc", fontSize: 10, fontFamily: "JetBrains Mono" }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#1c1b1c",
                          border: "1px solid #46464c",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontFamily: "JetBrains Mono",
                        }}
                        labelFormatter={(v) => new Date(v as number).toISOString()}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#f97316"
                        fill="#f97316"
                        fillOpacity={0.1}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      {flareMarkers.map((fm, i) => (
                        <ReferenceLine key={i} x={fm.x} stroke={fm.color} strokeDasharray="4 4" strokeWidth={2} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Right sidebar (30%) */}
            <aside className="w-[30%] flex flex-col gap-gutter overflow-y-auto">
              {/* Forecast gauges */}
              <div className="glass-panel rounded-lg p-6 flex flex-col gap-4 shrink-0">
                <h3 className="text-label-caps font-label-caps text-secondary border-b border-outline-variant/30 pb-2">
                  FORECAST PROBABILITY
                </h3>
                <div className="flex justify-around items-center py-4">
                  {/* 15-min gauge */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative w-24 h-24">
                      <svg className="w-full h-full" viewBox="0 0 36 36">
                        <path
                          className="stroke-current text-surface-variant opacity-20"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          strokeWidth="3"
                        />
                        <path
                          className="stroke-current"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          strokeDasharray={`${forecast.probability_15min * 100}, 100`}
                          strokeLinecap="round"
                          strokeWidth="3"
                          style={{ color: forecast.alert_15min ? "#ef4444" : "#facc15" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span
                          className="text-data-lg font-data-lg"
                          style={{ color: forecast.alert_15min ? "#ef4444" : "#facc15" }}
                        >
                          {(forecast.probability_15min * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <span className="text-label-caps text-[10px] text-on-surface-variant">15-MIN WINDOW</span>
                  </div>
                  {/* 30-min gauge */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative w-24 h-24">
                      <svg className="w-full h-full" viewBox="0 0 36 36">
                        <path
                          className="stroke-current text-surface-variant opacity-20"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          strokeWidth="3"
                        />
                        <path
                          className="stroke-current"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          strokeDasharray={`${forecast.probability_30min * 100}, 100`}
                          strokeLinecap="round"
                          strokeWidth="3"
                          style={{ color: forecast.alert_30min ? "#ef4444" : "#facc15" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span
                          className="text-data-lg font-data-lg"
                          style={{ color: forecast.alert_30min ? "#ef4444" : "#facc15" }}
                        >
                          {(forecast.probability_30min * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <span className="text-label-caps text-[10px] text-on-surface-variant">30-MIN WINDOW</span>
                  </div>
                </div>
              </div>

              {/* Replay controls */}
              <div className="glass-panel rounded-lg p-6 flex flex-col gap-6 shrink-0">
                <h3 className="text-label-caps font-label-caps text-secondary border-b border-outline-variant/30 pb-2">
                  MISSION REPLAY CONTROLS
                </h3>
                <div className="flex items-center gap-4">
                  <button
                    className="w-12 h-12 flex items-center justify-center rounded-full border border-primary text-primary hover:bg-primary/10 transition-colors"
                    onClick={replay.isPlaying ? onPause : onPlay}
                  >
                    <span className="material-symbols-outlined">{replay.isPlaying ? "pause" : "play_arrow"}</span>
                  </button>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-on-surface-variant">TIMELINE PROGRESS</span>
                      <span className="text-[10px] text-primary">{replay.isPlaying ? "LIVE" : "PAUSED"}</span>
                    </div>
                    <div className="w-full bg-surface-variant/30 h-1 rounded-full overflow-hidden">
                      <div className="bg-primary h-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_1.5fr] gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-on-surface-variant uppercase tracking-tighter">
                      Playback Speed
                    </label>
                    <select
                      className="bg-primary-container text-body-md font-body-md border border-outline-variant/30 rounded px-2 py-1 focus:ring-0 focus:border-primary"
                      value={replay.speed}
                      onChange={(e) => onSpeedChange(Number(e.target.value))}
                    >
                      <option value={1}>1x (Realtime)</option>
                      <option value={10}>10x</option>
                      <option value={60}>60x</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-on-surface-variant uppercase tracking-tighter">Date Range</label>
                    <div className="flex flex-col gap-2">
                      <input 
                        type="date"
                        className="bg-primary-container text-body-md font-body-md border border-outline-variant/30 rounded px-2 py-1 w-full focus:ring-0 focus:border-primary cursor-pointer text-primary"
                        value={timeRange[0].split("T")[0]}
                        onChange={(e) => {
                           if (e.target.value) onTimeRangeChange(`${e.target.value}T00:00:00Z`, timeRange[1]);
                        }}
                      />
                      <input 
                        type="date"
                        className="bg-primary-container text-body-md font-body-md border border-outline-variant/30 rounded px-2 py-1 w-full focus:ring-0 focus:border-primary cursor-pointer text-primary"
                        value={timeRange[1].split("T")[0]}
                        onChange={(e) => {
                           if (e.target.value) onTimeRangeChange(timeRange[0], `${e.target.value}T00:00:00Z`);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Sun Feed */}
              <div className="flex-1 glass-panel rounded-lg overflow-hidden relative group min-h-[180px]">
                <div className="absolute inset-0 flex items-center justify-center">
                  {/* Sun visualization */}
                  <img 
                    src="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg" 
                    alt="Live Sun" 
                    className="w-full h-full object-cover opacity-70 mix-blend-screen"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none z-10" />
                <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
                  <span className="w-2 h-2 rounded-full bg-flare-x animate-pulse" />
                  <span className="text-label-caps" style={{ fontSize: "9px", fontWeight: 700, color: "#ef4444" }}>LIVE FEED: SUIT</span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 z-20">
                  <p className="text-label-caps" style={{ fontSize: "9px", color: "#e5e2e3" }}>AR 3241 ACTIVE REGION</p>
                  <p style={{ fontSize: "9px", color: "#909096", fontFamily: "JetBrains Mono" }}>0.3–1.5 ÅNGSTRÖMS</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
  );
}
