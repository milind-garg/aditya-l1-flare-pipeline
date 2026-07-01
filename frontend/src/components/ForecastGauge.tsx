interface Props {
  probability15: number;
  probability30: number;
  alert15: boolean;
  alert30: boolean;
}

export default function ForecastGauge({ probability15, probability30, alert15, alert30 }: Props) {
  const getColor = (prob: number) => {
    if (prob < 0.3) return "#00b894";
    if (prob < 0.6) return "#fdcb6e";
    return "#e17055";
  };

  const getAlertText = (prob: number, alert: boolean) => {
    if (alert) return `ALERT - ${(prob * 100).toFixed(0)}%`;
    return `${(prob * 100).toFixed(0)}%`;
  };

  return (
    <div className="forecast-gauges">
      <h3>Forecast Probability</h3>
      <div className="gauges-row">
        <div className="gauge">
          <div className="gauge-label">Next 15 min</div>
          <div className="gauge-bar-track">
            <div
              className="gauge-bar-fill"
              style={{
                width: `${Math.min(probability15 * 100, 100)}%`,
                backgroundColor: getColor(probability15),
              }}
            />
          </div>
          <div className={`gauge-value ${alert15 ? "alert" : ""}`} style={{ color: getColor(probability15) }}>
            {getAlertText(probability15, alert15)}
          </div>
        </div>
        <div className="gauge">
          <div className="gauge-label">Next 30 min</div>
          <div className="gauge-bar-track">
            <div
              className="gauge-bar-fill"
              style={{
                width: `${Math.min(probability30 * 100, 100)}%`,
                backgroundColor: getColor(probability30),
              }}
            />
          </div>
          <div className={`gauge-value ${alert30 ? "alert" : ""}`} style={{ color: getColor(probability30) }}>
            {getAlertText(probability30, alert30)}
          </div>
        </div>
      </div>
    </div>
  );
}
