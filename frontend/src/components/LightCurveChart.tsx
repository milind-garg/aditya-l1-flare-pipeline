import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
  Area,
} from "recharts";
import type { FlareEvent } from "../api/client";

interface ChartDataPoint {
  timestamp: string;
  soft: number;
  hard: number;
  soft_bg: number;
  hard_bg: number;
}

interface Props {
  data: ChartDataPoint[];
  flares: FlareEvent[];
  timeRange: [string, string];
  onFlareClick?: (flare: FlareEvent) => void;
}

const CLASS_COLORS: Record<string, string> = {
  A: "#888888",
  B: "#aaaaaa",
  C: "#ffd700",
  M: "#ff8c00",
  X: "#ff4500",
};

function getFlareColor(flareClass: string): string {
  const letter = flareClass?.charAt(0) || "A";
  return CLASS_COLORS[letter] || "#888888";
}

export default function LightCurveChart({ data, flares, timeRange }: Props) {
  const chartData = data.map((d) => ({ ...d, ts: new Date(d.timestamp).getTime() }));
  const softMax = Math.max(...data.map((d) => d.soft), 1);
  const hardMax = Math.max(...data.map((d) => d.hard), 1);

  const flareMarkers = flares
    .filter((f) => {
      const fTime = new Date(f.peak).getTime();
      return fTime >= new Date(timeRange[0]).getTime() && fTime <= new Date(timeRange[1]).getTime();
    })
    .map((f) => ({
      x: new Date(f.peak).getTime(),
      label: f.class,
      color: getFlareColor(f.class),
      flare: f,
    }));

  const formatTime = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="chart-container">
      <h3 className="chart-title">
        SoLEXS (Soft X-ray) & HEL1OS (Hard X-ray) Light Curves
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="ts"
            scale="time"
            domain={["auto", "auto"]}
            tick={{ fill: "#ccc", fontSize: 11 }}
            tickFormatter={formatTime}
            label={{ value: "Time (UTC)", position: "insideBottom", offset: -10, fill: "#ccc" }}
          />
          <YAxis
            yAxisId="soft"
            orientation="left"
            tick={{ fill: "#ff6b6b", fontSize: 11 }}
            label={{ value: "Soft X-ray (counts/s)", angle: -90, position: "insideLeft", fill: "#ff6b6b", style: { textOrientation: "mixed" } }}
            domain={[0, softMax * 1.1]}
          />
          <YAxis
            yAxisId="hard"
            orientation="right"
            tick={{ fill: "#4ecdc4", fontSize: 11 }}
            label={{ value: "Hard X-ray (counts/s)", angle: 90, position: "insideRight", fill: "#4ecdc4", style: { textOrientation: "mixed" } }}
            domain={[0, hardMax * 1.1]}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: "8px" }}
            labelStyle={{ color: "#eee" }}
            labelFormatter={(v) => new Date(v as number).toISOString()}
          />
          <Legend />
          <Area
            yAxisId="soft"
            type="monotone"
            dataKey="soft"
            stroke="#ff6b6b"
            fill="#ff6b6b"
            fillOpacity={0.1}
            name="Soft X-ray (SoLEXS)"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="hard"
            type="monotone"
            dataKey="hard"
            stroke="#4ecdc4"
            name="Hard X-ray (HEL1OS)"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          {flareMarkers.map((fm, i) => (
            <ReferenceLine
              key={i}
              x={fm.x}
              stroke={fm.color}
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: fm.label,
                position: "top",
                fill: fm.color,
                fontSize: 12,
                fontWeight: "bold",
              }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type { ChartDataPoint };
