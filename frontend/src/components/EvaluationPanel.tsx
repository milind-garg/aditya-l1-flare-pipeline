import type { EvaluationResponse } from "../api/client";

interface Props {
  metrics: EvaluationResponse | null;
}

function getClassColor(cls: string): string {
  const colors: Record<string, string> = { A: "#888", B: "#aaa", C: "#ffd700", M: "#ff8c00", X: "#ff4500" };
  return colors[cls] || "#888";
}

export default function EvaluationPanel({ metrics }: Props) {
  if (!metrics) {
    return (
      <div className="evaluation-panel">
        <h3>Model Evaluation</h3>
        <p className="no-data">No evaluation data available. Run the forecasting pipeline first.</p>
      </div>
    );
  }

  const { detection, forecast } = metrics;

  return (
    <div className="evaluation-panel">
      <h3>Model Performance Metrics</h3>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">True Positive Rate</div>
          <div className="metric-value">{(forecast.tpr * 100).toFixed(1)}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">False Alarm Rate</div>
          <div className="metric-value">{(forecast.far * 100).toFixed(1)}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">ROC-AUC</div>
          <div className="metric-value">{forecast.roc_auc.toFixed(3)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Precision</div>
          <div className="metric-value">{(forecast.precision * 100).toFixed(1)}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">F1 Score</div>
          <div className="metric-value">{(forecast.f1 * 100).toFixed(1)}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Best Threshold</div>
          <div className="metric-value">{forecast.best_threshold.toFixed(2)}</div>
        </div>
      </div>

      <h4>Lead Time Distribution</h4>
      <div className="metrics-grid">
        <div className="metric-card small">
          <div className="metric-label">Median</div>
          <div className="metric-value">{forecast.lead_time_minutes.median.toFixed(1)} min</div>
        </div>
        <div className="metric-card small">
          <div className="metric-label">Mean</div>
          <div className="metric-value">{forecast.lead_time_minutes.mean.toFixed(1)} min</div>
        </div>
        <div className="metric-card small">
          <div className="metric-label">Min</div>
          <div className="metric-value">{forecast.lead_time_minutes.min.toFixed(1)} min</div>
        </div>
        <div className="metric-card small">
          <div className="metric-label">Max</div>
          <div className="metric-value">{forecast.lead_time_minutes.max.toFixed(1)} min</div>
        </div>
      </div>

      <h4>Per-Class Detection Recall</h4>
      <div className="per-class-grid">
        {Object.entries(detection).map(([cls, data]) => (
          <div key={cls} className="class-recall-card">
            <div className="class-label" style={{ color: getClassColor(cls) }}>
              {cls} Class
            </div>
            <div className="class-bar-track">
              <div
                className="class-bar-fill"
                style={{
                  width: `${data.recall * 100}%`,
                  backgroundColor: getClassColor(cls),
                }}
              />
            </div>
            <div className="class-stats">
              Recall: {(data.recall * 100).toFixed(0)}% ({data.detected}/{data.total})
            </div>
          </div>
        ))}
        {Object.keys(detection).length === 0 && (
          <p className="no-data">No flare class recall data available</p>
        )}
      </div>
    </div>
  );
}
