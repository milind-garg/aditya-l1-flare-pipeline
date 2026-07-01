interface Props {
  isPlaying: boolean;
  speed: number;
  currentTime: string;
  onPlay: () => void;
  onPause: () => void;
  onSpeedChange: (speed: number) => void;
}

const SPEED_OPTIONS = [1, 10, 60, 120];

export default function ReplayControls({ isPlaying, speed, currentTime, onPlay, onPause, onSpeedChange }: Props) {
  return (
    <div className="replay-controls">
      <div className="replay-info">
        <span className="replay-time">{currentTime ? new Date(currentTime).toISOString().replace("T", " ").slice(0, 19) : "---"}</span>
        <span className="replay-status">{isPlaying ? "LIVE" : "PAUSED"}</span>
      </div>
      <div className="replay-buttons">
        <button
          className={`replay-btn ${isPlaying ? "active" : ""}`}
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying ? "\u23F8" : "\u25B6"}
        </button>
        <div className="speed-controls">
          <span className="speed-label">Speed:</span>
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              className={`speed-btn ${speed === s ? "active" : ""}`}
              onClick={() => onSpeedChange(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
