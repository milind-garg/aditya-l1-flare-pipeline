interface Props {
  alert15: boolean;
  alert30: boolean;
  probability15: number;
  probability30: number;
  leadTime?: number;
  currentFlare?: string;
}

export default function AlertBanner({ alert15, alert30, probability15, probability30, leadTime, currentFlare }: Props) {
  const isActive = alert15 || alert30;
  const maxProb = Math.max(probability15, probability30);
  const horizon = probability15 >= probability30 ? 15 : 30;

  if (!isActive) {
    return (
      <div className="alert-banner alert-inactive">
        <div className="alert-icon">&#9679;</div>
        <div className="alert-text">
          <strong>Nominal</strong> - No significant flare activity predicted
        </div>
      </div>
    );
  }

  return (
    <div className={`alert-banner alert-active alert-level-${Math.min(Math.floor(maxProb * 5), 4)}`}>
      <div className="alert-icon">&#9888;</div>
      <div className="alert-text">
        <strong>FLARE ALERT</strong>
        <br />
        {currentFlare && <span className="alert-flare-class">{currentFlare} flare detected - </span>}
        Probability of flare within next {horizon} min: <strong>{(maxProb * 100).toFixed(0)}%</strong>
        {leadTime !== undefined && leadTime > 0 && (
          <span className="alert-lead-time">
            {" "}
            | Lead time: <strong>{leadTime.toFixed(1)} min</strong>
          </span>
        )}
      </div>
    </div>
  );
}
