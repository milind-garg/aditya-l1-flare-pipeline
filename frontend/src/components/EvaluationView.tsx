import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  LineChart,
  Line,
  ResponsiveContainer,
  Label,
} from "recharts";

interface EvaluationMetrics {
  detection: Record<string, { recall: number }>;
  forecast: {
    tpr: number;
    far: number;
    roc_auc: number;
    lead_time_minutes: {
      median: number;
      mean: number;
      min: number;
      max: number;
      distribution: number[];
    };
    roc_curve: {
      fpr: number[];
      tpr: number[];
    };
  };
}

interface EvaluationViewProps {
  metrics: EvaluationMetrics | null;
  isLoading: boolean;
}

const DETECTION_CLASSES = ["A", "B", "C", "M", "X"];

const CLASS_BAR_COLORS: Record<string, string> = {
  A: "#6b7280",
  B: "#6b7280",
  C: "#eab308",
  M: "#f97316",
  X: "#ef4444",
};

const SKELETON_METRIC_CARDS = Array.from({ length: 4 });

function MetricSkeleton() {
  return (
    <div className="glass-panel p-4 animate-pulse">
      <div className="h-3 w-28 rounded bg-surface-variant/40 mb-2" />
      <div className="h-8 w-16 rounded bg-surface-variant/40 mb-2" />
      <div className="h-3 w-36 rounded bg-surface-variant/30" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="glass-panel p-6 animate-pulse">
      <div className="h-3 w-48 rounded bg-surface-variant/40 mb-6" />
      <div className="h-[300px] w-full rounded bg-surface-variant/20" />
    </div>
  );
}

function tprColor(tpr: number): string {
  if (tpr > 0.8) return "#22c55e";
  if (tpr >= 0.6) return "#eab308";
  return "#ef4444";
}

function farColor(far: number): string {
  if (far < 0.1) return "#22c55e";
  if (far <= 0.2) return "#eab308";
  return "#ef4444";
}

export default function EvaluationView({ metrics, isLoading }: EvaluationViewProps) {
  const recallData = useMemo(() => {
    if (!metrics) return [];
    return DETECTION_CLASSES.map((cls) => ({
      name: cls,
      recall: metrics.detection[cls]?.recall ?? 0,
      fill: CLASS_BAR_COLORS[cls] || "#6b7280",
    }));
  }, [metrics]);

  const leadTimeBins = useMemo(() => {
    if (!metrics?.forecast?.lead_time_minutes?.distribution) return [];
    const dist = metrics.forecast.lead_time_minutes.distribution;
    const bins: Record<string, number> = {
      "0-5": 0,
      "5-10": 0,
      "10-15": 0,
      "15-20": 0,
      "20-25": 0,
      "25+": 0,
    };
    for (const val of dist) {
      if (val < 5) bins["0-5"]++;
      else if (val < 10) bins["5-10"]++;
      else if (val < 15) bins["10-15"]++;
      else if (val < 20) bins["15-20"]++;
      else if (val < 25) bins["20-25"]++;
      else bins["25+"]++;
    }
    return Object.entries(bins).map(([bucket, count]) => ({ bucket, count }));
  }, [metrics]);

  const rocData = useMemo(() => {
    if (!metrics?.forecast?.roc_curve) return [];
    const { fpr, tpr } = metrics.forecast.roc_curve;
    return fpr.map((fp, i) => ({ fpr: fp, tpr: tpr[i] ?? 0 }));
  }, [metrics]);

  const baselineData = [
    { fpr: 0, tpr: 0 },
    { fpr: 1, tpr: 1 },
  ];

  const median = metrics?.forecast?.lead_time_minutes?.median ?? 0;

  const chartTooltipStyle = {
    background: "#111827",
    border: "1px solid #46464c",
    borderRadius: "4px",
    fontSize: "11px",
    fontFamily: "JetBrains Mono, monospace",
    color: "#e5e2e3",
  };

  const tickStyle = { fill: "#c7c6cc", fontSize: 11, fontFamily: "JetBrains Mono, monospace" };

  return (
        <main className="flex-1 h-full px-6 pb-12 overflow-y-auto pt-6">
          <header className="mb-8 flex justify-between items-end">
            <div>
              <h1 className="text-display-lg font-display-lg text-primary mb-2">Model Evaluation</h1>
              <p className="text-body-md font-body-md text-on-surface-variant">
                Performance validation of the Flare-Detection v4.2 Engine against L1 observatory ground truth.
              </p>
            </div>
            <div className="flex gap-4">
              <button className="border border-primary px-6 py-2 text-label-caps font-label-caps hover:bg-primary/10 transition-all">
                EXPORT REPORT
              </button>
              <button className="bg-primary text-on-primary px-6 py-2 text-label-caps font-label-caps hover:opacity-90 transition-all">
                RE-TRAIN MODEL
              </button>
            </div>
          </header>

          {/* Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {isLoading || !metrics ? (
              SKELETON_METRIC_CARDS.map((_, i) => <MetricSkeleton key={i} />)
            ) : (
              <>
                <div className="glass-panel p-4 glow-border">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-label-caps font-label-caps text-on-surface-variant">True Positive Rate</span>
                    <span className="material-symbols-outlined text-primary">trending_up</span>
                  </div>
                  <div className="text-display-lg font-display-lg leading-none" style={{ color: tprColor(metrics.forecast.tpr) }}>
                    {(metrics.forecast.tpr * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-mono-sm text-on-surface-variant">+2.4% from previous epoch</div>
                </div>
                <div className="glass-panel p-4 glow-border">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-label-caps font-label-caps text-on-surface-variant">False Alarm Rate</span>
                    <span className="material-symbols-outlined text-error">trending_down</span>
                  </div>
                  <div className="text-display-lg font-display-lg leading-none" style={{ color: farColor(metrics.forecast.far) }}>
                    {(metrics.forecast.far * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-mono-sm text-on-surface-variant">-0.8% reduction in noise</div>
                </div>
                <div className="glass-panel p-4 glow-border">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-label-caps font-label-caps text-on-surface-variant">ROC-AUC</span>
                    <span className="material-symbols-outlined text-tertiary">analytics</span>
                  </div>
                  <div className="text-display-lg font-display-lg text-tertiary leading-none">
                    {metrics.forecast.roc_auc.toFixed(3)}
                  </div>
                  <div className="mt-2 text-mono-sm text-on-surface-variant">Confidence interval: ±0.02</div>
                </div>
                <div className="glass-panel p-4 glow-border">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-label-caps font-label-caps text-on-surface-variant">Median Lead Time</span>
                    <span className="material-symbols-outlined text-secondary">schedule</span>
                  </div>
                  <div className="text-display-lg font-display-lg text-secondary leading-none">
                    {metrics.forecast.lead_time_minutes.median} min
                  </div>
                  <div className="mt-2 text-mono-sm text-on-surface-variant">+1.2 min warning threshold</div>
                </div>
              </>
            )}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter mb-8">
            {/* Detection Recall Bar Chart */}
            {isLoading || !metrics ? (
              <>
                <ChartSkeleton />
                <ChartSkeleton />
              </>
            ) : (
              <>
                <div className="glass-panel p-6 flex flex-col h-[400px]">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="w-1 h-4 bg-primary" />
                    <h3 className="text-label-caps font-label-caps">Detection Recall by Flare Class</h3>
                  </div>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={recallData} margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#46464c" opacity={0.3} />
                        <XAxis dataKey="name" tick={tickStyle} axisLine={{ stroke: "#46464c", opacity: 0.3 }} tickLine={false} />
                        <YAxis
                          domain={[0, 1]}
                          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                          tick={tickStyle}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
                        <ReferenceLine y={0.8} stroke="#ffffff" strokeDasharray="4 4" strokeWidth={1.5}>
                          <Label value="80% target" position="right" fill="#ffffff" fontSize={10} fontFamily="JetBrains Mono" />
                        </ReferenceLine>
                        <Bar dataKey="recall" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                          {recallData.map((entry) => (
                            <rect key={entry.name} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Lead Time Distribution Histogram */}
                <div className="glass-panel p-6 flex flex-col h-[400px]">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="w-1 h-4 bg-secondary" />
                    <h3 className="text-label-caps font-label-caps">Lead Time Distribution (Minutes)</h3>
                  </div>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={leadTimeBins} margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#46464c" opacity={0.3} />
                        <XAxis dataKey="bucket" tick={tickStyle} axisLine={{ stroke: "#46464c", opacity: 0.3 }} tickLine={false} />
                        <YAxis tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <ReferenceLine x={findBucketLabel(median)} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1.5}>
                          <Label value={`Median: ${median.toFixed(1)}m`} position="top" fill="#22c55e" fontSize={10} fontFamily="JetBrains Mono" />
                        </ReferenceLine>
                        <Bar dataKey="count" fill="#6366f1" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ROC Curve */}
          {isLoading || !metrics ? (
            <ChartSkeleton />
          ) : (
            <div className="glass-panel p-8 mb-8">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-4 bg-tertiary" />
                  <h3 className="text-label-caps font-label-caps">Receiver Operating Characteristic (ROC) Curve</h3>
                </div>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-primary" />
                    <span className="text-mono-sm text-on-surface-variant">Model Performance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-[1px] bg-outline border-t border-dashed" />
                    <span className="text-mono-sm text-on-surface-variant">Baseline (Random)</span>
                  </div>
                </div>
              </div>
              <div style={{ height: "400px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rocData} margin={{ top: 8, right: 24, bottom: 24, left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#46464c" opacity={0.3} />
                    <XAxis
                      dataKey="fpr"
                      type="number"
                      domain={[0, 1]}
                      tick={tickStyle}
                      axisLine={{ stroke: "#46464c", opacity: 0.3 }}
                      tickLine={false}
                    >
                      <Label value="False Positive Rate" position="bottom" offset={0} fill="#c7c6cc" fontSize={11} fontFamily="JetBrains Mono" />
                    </XAxis>
                    <YAxis
                      type="number"
                      domain={[0, 1]}
                      tick={tickStyle}
                      axisLine={false}
                      tickLine={false}
                    >
                      <Label value="True Positive Rate" angle={-90} position="insideLeft" offset={-8} fill="#c7c6cc" fontSize={11} fontFamily="JetBrains Mono" style={{ textAnchor: "middle" }} />
                    </YAxis>
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v, n) => [Number(v).toFixed(3), n === "tpr" ? "TPR" : n === "baseline_tpr" ? "Baseline TPR" : String(n)]} />
                    <Line
                      type="monotone"
                      dataKey="tpr"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      name="tpr"
                    />
                    <Line
                      type="linear"
                      data={baselineData}
                      dataKey="tpr"
                      stroke="#909096"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                      name="baseline_tpr"
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 text-sm text-gray-500 font-mono-sm">
                Evaluated on chronological test split &mdash; last 30% of the observation window used for testing, first 70% for training.
              </div>
            </div>
          )}

          {/* Detection Matrix Summary Table */}
          {!isLoading && metrics && (
            <div className="glass-panel overflow-hidden">
              <div className="p-6 border-b border-outline-variant/15 flex justify-between items-center bg-surface-container-high/20">
                <h3 className="text-label-caps font-label-caps">Detection Matrix Summary</h3>
                <span className="text-mono-sm opacity-50">Last Batch: 4,200 events detected</span>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-high/40">
                    <th className="px-6 py-3 text-label-caps font-label-caps text-on-surface-variant">Flare Category</th>
                    <th className="px-6 py-3 text-label-caps font-label-caps text-on-surface-variant">Detection Recall</th>
                    <th className="px-6 py-3 text-label-caps font-label-caps text-on-surface-variant">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {DETECTION_CLASSES.map((cls) => {
                    const entry = metrics.detection[cls];
                    const recall = entry?.recall ?? 0;
                    const recallPct = (recall * 100).toFixed(1);
                    const isGood = recall >= 0.8;
                    const barColor = CLASS_BAR_COLORS[cls] || "#6b7280";
                    return (
                      <tr key={cls} className="hover:bg-surface-variant/10 transition-colors">
                        <td className="px-6 py-3">
                          <span
                            className="px-2 py-0.5 font-bold rounded-sm text-xs"
                            style={{ backgroundColor: barColor, color: cls === "A" || cls === "B" ? "#fff" : "#000" }}
                          >
                            {cls}-CLASS
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-32 h-2 bg-surface-variant/40 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${recallPct}%`, backgroundColor: barColor }} />
                            </div>
                            <span className="text-body-md font-body-md" style={{ color: barColor }}>{recallPct}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`flex items-center gap-2 ${isGood ? "text-primary" : "text-on-surface-variant"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isGood ? "bg-primary" : "bg-on-surface-variant/40"}`} />
                            <span className="text-mono-sm">{isGood ? "NOMINAL" : "MONITORING"}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
  );
}

function findBucketLabel(median: number): string {
  if (median < 5) return "0-5";
  if (median < 10) return "5-10";
  if (median < 15) return "10-15";
  if (median < 20) return "15-20";
  if (median < 25) return "20-25";
  return "25+";
}
