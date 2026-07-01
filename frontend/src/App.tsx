import { useState, useEffect, useCallback, useRef } from "react";
import {
  getTimeseries,
  getFlares,
  getForecast,
  getEvaluation,
  createReplayWebSocket,
} from "./api/client";
import type { FlareEvent, EvaluationResponse } from "./api/client";
import MonitorView from "./components/MonitorView";
import CatalogueView from "./components/CatalogueView";
import EvaluationView from "./components/EvaluationView";
import AlertingView from "./components/AlertingView";
import AppShell from "./components/AppShell";
import "./App.css";

type Tab = "monitor" | "catalogue" | "evaluation" | "alerts";

interface ReplayState {
  isPlaying: boolean;
  speed: number;
  currentTime: string;
}

interface ReplayMessage {
  timestamp: string;
  soft: number;
  hard: number;
  flare_event: FlareEvent | null;
  forecast_probability_15min: number | null;
  forecast_probability_30min: number | null;
}

// Sept 1-15 is flare-rich: contains M, X, X+ class events with precursor hard-only bursts
const DEFAULT_START = "2024-09-01T00:00:00Z";
const DEFAULT_END   = "2024-09-15T00:00:00Z";

/** Pick a downsample resolution so the chart renders ≤800 points max. */
function smartResolution(start: string, end: string): string {
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const diffMin = diffMs / 60000;
  if (diffMin <= 60)   return "10s";   // ≤1h  → 10s cadence (360 pts)
  if (diffMin <= 360)  return "1min";  // ≤6h  → 1-min  (360 pts)
  if (diffMin <= 1440) return "5min";  // ≤1d  → 5-min  (288 pts)
  if (diffMin <= 7200) return "15min"; // ≤5d  → 15-min (480 pts)
  return "1h";                          // >5d  → 1-hour
}


function App() {
  const [activeTab, setActiveTab] = useState<Tab>("monitor");
  const [timeRange, setTimeRange] = useState<[string, string]>([DEFAULT_START, DEFAULT_END]);
  const [timeSeries, setTimeSeries] = useState<any[]>([]);
  const [flares, setFlares] = useState<FlareEvent[]>([]);
  const [_forecastData, setForecastData] = useState<any>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null);
  const [replay, setReplay] = useState<ReplayState>({ isPlaying: false, speed: 60, currentTime: "" });
  const [alertState, setAlertState] = useState({ alert15: false, alert30: false, prob15: 0, prob30: 0, leadTime: 0, currentFlare: "" });
  const [_currentFlareEvent, setCurrentFlareEvent] = useState<FlareEvent | null>(null);
  const [isLoadingMonitor, setIsLoadingMonitor] = useState(true);
  const [isLoadingEvaluation, setIsLoadingEvaluation] = useState(true);
  const [selectedFlarePeak, setSelectedFlarePeak] = useState<string | undefined>();
  const [apiError, setApiError] = useState<string | null>(null);
  const [liveUtc, setLiveUtc] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = now.getUTCHours().toString().padStart(2, "0");
      const m = now.getUTCMinutes().toString().padStart(2, "0");
      const s = now.getUTCSeconds().toString().padStart(2, "0");
      const ist = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
      setLiveUtc(`UTC ${h}:${m}:${s}  •  IST ${ist}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const loadData = useCallback(async (start: string, end: string) => {
    setIsLoadingMonitor(true);
    try {
      const resolution = smartResolution(start, end);
      const [ts, fl, fc] = await Promise.all([
        getTimeseries(start, end, resolution),
        getFlares(start, end),
        getForecast(start, end),
      ]);

      const chartData = ts.timestamps.map((t, i) => ({
        timestamp: t,
        soft: ts.soft[i],
        hard: ts.hard[i],
        soft_bg: 0,
        hard_bg: 0,
      }));

      setTimeSeries(chartData);
      setFlares(fl.flares || []);

      if (fc?.timestamps?.length > 0) {
        setForecastData(fc);
        const lastIdx = fc.timestamps.length - 1;
        setAlertState((prev) => ({
          ...prev,
          alert15: fc.alert_15min?.[lastIdx] || false,
          alert30: fc.alert_30min?.[lastIdx] || false,
          prob15: fc.probability_15min?.[lastIdx] || 0,
          prob30: fc.probability_30min?.[lastIdx] || 0,
        }));
      }
    } catch (err: any) {
      console.error("Failed to load data:", err);
      setApiError(err.message || "Connection to L1 Data Center lost.");
    } finally {
      setIsLoadingMonitor(false);
    }
  }, []);

  const loadEvaluation = useCallback(async () => {
    setIsLoadingEvaluation(true);
    try {
      const ev = await getEvaluation();
      setEvaluation(ev);
    } catch (err: any) {
      console.error("Failed to load evaluation:", err);
      setApiError(err.message || "Failed to load evaluation metrics.");
    } finally {
      setIsLoadingEvaluation(false);
    }
  }, []);

  useEffect(() => {
    loadData(timeRange[0], timeRange[1]);
    loadEvaluation();
  }, [timeRange, loadData, loadEvaluation]);

  const startReplay = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setReplay((r) => ({ ...r, isPlaying: true }));

    const ws = createReplayWebSocket(timeRange[0], timeRange[1], replay.speed);
    wsRef.current = ws;

    const receivedData: any[] = [];

    ws.onmessage = (event) => {
      try {
        const msg: ReplayMessage = JSON.parse(event.data);
        if ("error" in msg) {
          console.error("Replay error:", msg);
          return;
        }

        receivedData.push({
          timestamp: msg.timestamp,
          soft: msg.soft,
          hard: msg.hard,
          soft_bg: 0,
          hard_bg: 0,
        });

        setReplay((r) => ({ ...r, currentTime: msg.timestamp }));

        setAlertState((prev) => ({
          ...prev,
          prob15: msg.forecast_probability_15min ?? prev.prob15,
          prob30: msg.forecast_probability_30min ?? prev.prob30,
          alert15: (msg.forecast_probability_15min ?? prev.prob15) > 0.5,
          alert30: (msg.forecast_probability_30min ?? prev.prob30) > 0.5,
          currentFlare: msg.flare_event?.class || "",
          leadTime: msg.flare_event
            ? (new Date(msg.flare_event.peak).getTime() - new Date(msg.timestamp).getTime()) / 60000
            : prev.leadTime,
        }));

        if (msg.flare_event) {
          setCurrentFlareEvent(msg.flare_event);
          setFlares((prev) => {
            if (prev.some((f) => f.id === msg.flare_event!.id)) return prev;
            return [...prev, msg.flare_event!];
          });
        }

        if (receivedData.length > 500) {
          receivedData.splice(0, 100);
        }
        setTimeSeries([...receivedData]);
      } catch (err) {
        console.error("Error parsing replay message:", err);
      }
    };

    ws.onclose = () => {
      setReplay((r) => ({ ...r, isPlaying: false }));
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      setReplay((r) => ({ ...r, isPlaying: false }));
    };
  }, [timeRange, replay.speed]);

  const pauseReplay = useCallback(() => {
    wsRef.current?.close();
    setReplay((r) => ({ ...r, isPlaying: false }));
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    setReplay((r) => ({ ...r, speed }));
    if (wsRef.current) {
      wsRef.current.close();
      if (replay.isPlaying) {
        setTimeout(() => startReplay(), 100);
      }
    }
  }, [replay.isPlaying, startReplay]);

  const handleFlareSelect = useCallback((flare: FlareEvent) => {
    setCurrentFlareEvent(flare);
    setSelectedFlarePeak(flare.peak);
    setActiveTab("monitor");
  }, []);

  const monitorForecast = {
    probability_15min: alertState.prob15,
    probability_30min: alertState.prob30,
    alert_15min: alertState.alert15,
    alert_30min: alertState.alert30,
    lead_time_minutes: alertState.leadTime,
  };

  const evaluationMetrics = evaluation
    ? {
        detection: Object.fromEntries(
          Object.entries(evaluation.detection).map(([cls, data]) => [cls, { recall: data.recall }])
        ),
        forecast: {
          tpr: evaluation.forecast.tpr,
          far: evaluation.forecast.far,
          roc_auc: evaluation.forecast.roc_auc,
          lead_time_minutes: {
            median: evaluation.forecast.lead_time_minutes.median,
            mean: evaluation.forecast.lead_time_minutes.mean,
            min: evaluation.forecast.lead_time_minutes.min,
            max: evaluation.forecast.lead_time_minutes.max,
            // Pass distribution from API (injected by backend) if present
            distribution: (evaluation.forecast as any).lead_time_minutes?.distribution ?? [] as number[],
          },
          // Pass ROC curve from API (injected by backend)
          roc_curve: {
            fpr: ((evaluation.forecast as any).roc_curve?.fpr ?? []) as number[],
            tpr: ((evaluation.forecast as any).roc_curve?.tpr ?? []) as number[],
          },
        },
      }
    : null;

  return (
    <AppShell activeTab={activeTab} setActiveTab={setActiveTab} utcTime={liveUtc}>
      {apiError ? (
        <div className="flex flex-col items-center justify-center h-full space-y-6 bg-surface-container/50">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center border border-error/30 text-error">
            <span className="material-symbols-outlined text-3xl">cloud_off</span>
          </div>
          <div className="text-center max-w-md">
            <h2 className="text-headline-md font-headline-md text-error mb-2">Telemetry Feed Offline</h2>
            <p className="text-body-md font-body-md text-on-surface-variant mb-6">{apiError}</p>
            <button 
              onClick={() => {
                setApiError(null);
                loadData(timeRange[0], timeRange[1]);
                loadEvaluation();
              }}
              className="bg-primary hover:bg-primary-hover text-on-primary px-6 py-2 rounded-full font-label-caps text-label-caps transition-colors"
            >
              RETRY CONNECTION
            </button>
          </div>
        </div>
      ) : (
        <>
          {activeTab === "monitor" && (
            <MonitorView
              timeSeries={timeSeries}
              flares={flares}
              forecast={monitorForecast}
              alertVisible={alertState.alert15 || alertState.alert30}
              currentFlareClass={alertState.currentFlare || undefined}
              replay={replay}
              timeRange={timeRange}
              onTimeRangeChange={(start, end) => setTimeRange([start, end])}
              selectedFlarePeak={selectedFlarePeak}
              onPlay={startReplay}
              onPause={pauseReplay}
              onSpeedChange={handleSpeedChange}
            />
          )}

          {activeTab === "catalogue" && (
            <CatalogueView
              flares={flares}
              isLoading={isLoadingMonitor}
              onFlareSelect={handleFlareSelect}
            />
          )}

          {activeTab === "evaluation" && (
            <EvaluationView
              metrics={evaluationMetrics}
              isLoading={isLoadingEvaluation}
            />
          )}

          {activeTab === "alerts" && (
            <AlertingView />
          )}
        </>
      )}
    </AppShell>
  );
}

export default App;
