const API_BASE = "/api";

interface TimeSeriesData {
  timestamps: string[];
  soft: number[];
  hard: number[];
}

interface FlareEvent {
  id: string;
  start: string;
  peak: string;
  end: string;
  class: string;
  peak_value: number;
  source: string;
  confidence: number;
}

interface FlareResponse {
  flares: FlareEvent[];
}

interface ForecastResponse {
  timestamps: string[];
  probability_15min: number[];
  probability_30min: number[];
  alert_15min: boolean[];
  alert_30min: boolean[];
  lead_time_minutes: number;
}

interface EvaluationResponse {
  detection: Record<string, { total: number; detected: number; recall: number }>;
  forecast: {
    tpr: number;
    far: number;
    roc_auc: number;
    best_threshold: number;
    precision: number;
    f1: number;
    lead_time_minutes: {
      median: number;
      mean: number;
      min: number;
      max: number;
    };
  };
}

export async function getTimeseries(
  start: string,
  end: string,
  resolution = "1s"
): Promise<TimeSeriesData> {
  const params = new URLSearchParams({ start, end, resolution });
  const res = await fetch(`${API_BASE}/timeseries?${params}`);
  if (!res.ok) throw new Error(`Failed to load time series: ${res.statusText}`);
  return res.json();
}

export async function getFlares(
  start: string,
  end: string,
  minClass?: string
): Promise<FlareResponse> {
  const params = new URLSearchParams({ start, end });
  if (minClass) params.append("min_class", minClass);
  const res = await fetch(`${API_BASE}/flares?${params}`);
  if (!res.ok) throw new Error(`Failed to load flares: ${res.statusText}`);
  return res.json();
}

export async function getForecast(
  start: string,
  end: string
): Promise<ForecastResponse> {
  const params = new URLSearchParams({ start, end });
  const res = await fetch(`${API_BASE}/forecast?${params}`);
  if (!res.ok) throw new Error(`Failed to load forecast: ${res.statusText}`);
  return res.json();
}

export async function getEvaluation(): Promise<EvaluationResponse> {
  const res = await fetch(`${API_BASE}/evaluation`);
  if (!res.ok) throw new Error(`Failed to load evaluation: ${res.statusText}`);
  return res.json();
}

export function createReplayWebSocket(
  start: string,
  end: string,
  speed = 60
): WebSocket {
  const params = new URLSearchParams({ start, end, speed: String(speed) });
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return new WebSocket(`${protocol}//${host}/api/ws/replay?${params}`);
}

export type { TimeSeriesData, FlareEvent, FlareResponse, ForecastResponse, EvaluationResponse };
