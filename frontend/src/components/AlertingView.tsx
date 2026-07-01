import { useState, useEffect } from "react";
import {
  getAlertConfig,
  saveAlertConfig,
  getAlertHistory,
  testWebhook,
} from "../api/client";
import type { AlertConfig, TriggeredAlert } from "../api/client";

export default function AlertingView() {
  const [config, setConfig] = useState<AlertConfig>({
    threshold_probability: 0.50,
    discord_webhook_url: "",
    slack_webhook_url: "",
    email_receiver: "",
    email_enabled: false,
    sms_enabled: false,
  });

  const [history, setHistory] = useState<TriggeredAlert[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Webhook Testing States
  const [isTestingDiscord, setIsTestingDiscord] = useState(false);
  const [isTestingSlack, setIsTestingSlack] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ text: string; error: boolean } | null>(null);

  // Load config and history
  const loadData = async () => {
    try {
      const [conf, hist] = await Promise.all([getAlertConfig(), getAlertHistory()]);
      setConfig(conf);
      setHistory(hist);
    } catch (err) {
      console.error("Failed to load alerting data:", err);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-poll history every 5 seconds
    const interval = setInterval(async () => {
      try {
        const hist = await getAlertHistory();
        setHistory(hist);
      } catch (err) {
        console.error("Failed to poll alert history:", err);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const res = await saveAlertConfig(config);
      setSaveMessage({ text: res.message, error: false });
      loadData();
    } catch (err: any) {
      setSaveMessage({ text: err.message || "Failed to save settings", error: true });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  const handleTestWebhook = async (type: "discord" | "slack") => {
    const url = type === "discord" ? config.discord_webhook_url : config.slack_webhook_url;
    if (!url) {
      setTestFeedback({ text: `Please enter a ${type} webhook URL first.`, error: true });
      setTimeout(() => setTestFeedback(null), 4000);
      return;
    }

    if (type === "discord") setIsTestingDiscord(true);
    else setIsTestingSlack(true);
    setTestFeedback(null);

    try {
      const res = await testWebhook(type, url);
      setTestFeedback({ text: res.message, error: false });
    } catch (err: any) {
      setTestFeedback({ text: err.message || `Test failed for ${type}`, error: true });
    } finally {
      setIsTestingDiscord(false);
      setIsTestingSlack(false);
      setTimeout(() => setTestFeedback(null), 5000);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "SENT":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">SENT</span>;
      case "COOLDOWN":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">COOLDOWN</span>;
      case "LOGGED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">LOGGED</span>;
      case "FAILED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">FAILED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400">{status}</span>;
    }
  };

  return (
    <div className="flex-1 flex p-gutter gap-gutter overflow-hidden h-full" style={{ backgroundColor: "#0a0e1a" }}>
      {/* Left Column: Settings Configuration (40%) */}
      <section className="w-[42%] flex flex-col gap-gutter overflow-y-auto">
        <div className="glass-panel rounded-lg p-container-padding flex flex-col gap-5">
          <div>
            <h2 className="text-h2 font-h2 text-primary uppercase">ALERTING ENGINE SETTINGS</h2>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Configure Space Weather broadcast rules, webhooks, and thresholds for satellite operation alerts.
            </p>
          </div>

          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {/* Probability threshold */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-label-caps text-sky-400 font-bold">PROBABILITY TRIGGER THRESHOLD</label>
                <span className="text-data-md font-data-md text-primary">
                  {(config.threshold_probability * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.95"
                step="0.05"
                className="w-full h-1 bg-surface-variant/30 rounded-lg appearance-none cursor-pointer accent-primary"
                value={config.threshold_probability}
                onChange={(e) => setConfig({ ...config, threshold_probability: parseFloat(e.target.value) })}
              />
              <span className="text-[10px] text-on-surface-variant">
                Alert is triggered if forecast probability for either the 15-min or 30-min window crosses this value.
              </span>
            </div>

            <hr className="border-outline-variant/20 my-1" />

            {/* Webhook inputs */}
            <div className="flex flex-col gap-4">
              <h3 className="text-label-caps text-secondary border-b border-outline-variant/10 pb-1">BROADCAST INTEGRATIONS</h3>

              {/* Discord Webhook */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Discord Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="https://discord.com/api/webhooks/..."
                    className="flex-1 bg-primary-container text-body-md font-mono border border-outline-variant/30 rounded px-3 py-1.5 focus:ring-0 focus:border-primary text-primary text-[11px]"
                    value={config.discord_webhook_url}
                    onChange={(e) => setConfig({ ...config, discord_webhook_url: e.target.value })}
                  />
                  <button
                    type="button"
                    className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded text-[10px] font-label-caps tracking-widest disabled:opacity-50"
                    onClick={() => handleTestWebhook("discord")}
                    disabled={isTestingDiscord}
                  >
                    {isTestingDiscord ? "TESTING..." : "TEST"}
                  </button>
                </div>
              </div>

              {/* Slack Webhook */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Slack Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="https://hooks.slack.com/services/..."
                    className="flex-1 bg-primary-container text-body-md font-mono border border-outline-variant/30 rounded px-3 py-1.5 focus:ring-0 focus:border-primary text-primary text-[11px]"
                    value={config.slack_webhook_url}
                    onChange={(e) => setConfig({ ...config, slack_webhook_url: e.target.value })}
                  />
                  <button
                    type="button"
                    className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded text-[10px] font-label-caps tracking-widest disabled:opacity-50"
                    onClick={() => handleTestWebhook("slack")}
                    disabled={isTestingSlack}
                  >
                    {isTestingSlack ? "TESTING..." : "TEST"}
                  </button>
                </div>
              </div>
            </div>

            {/* Test Feedback Display */}
            {testFeedback && (
              <div className={`p-2.5 rounded text-[10px] font-mono border text-center ${
                testFeedback.error 
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20" 
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}>
                {testFeedback.text}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-primary/20 border border-primary text-primary hover:bg-primary/30 transition-colors py-2 rounded text-label-caps font-semibold flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                  <span>SAVING RULES...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>SAVE RULES & INTEGRATIONS</span>
                </>
              )}
            </button>

            {saveMessage && (
              <div className={`text-[10px] text-center font-mono mt-1 ${saveMessage.error ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}>
                {saveMessage.text}
              </div>
            )}
          </form>
        </div>

        {/* Operational advisory card */}
        <div className="glass-panel rounded-lg p-5 flex flex-col gap-3">
          <h3 className="text-label-caps text-solar-amber font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">info</span>
            <span>OPERATIONAL COOLDOWN POLICY</span>
          </h3>
          <p className="text-[10.5px] text-on-surface-variant leading-relaxed">
            To prevent payload flight controller fatigue and alert storms in operational communication channels, the alerting engine automatically enforces a <strong>60-minute class-specific cooldown</strong>.
          </p>
          <p className="text-[10.5px] text-on-surface-variant leading-relaxed">
            Subsequent forecasts crossing the threshold for the same flare class within this window will be logged locally as <code>COOLDOWN</code> but will not dispatch duplicate notifications.
          </p>
        </div>
      </section>

      {/* Right Column: Triggered Alert History (58%) */}
      <section className="w-[58%] flex flex-col glass-panel rounded-lg p-container-padding overflow-hidden h-full">
        <div className="flex justify-between items-center mb-4 shrink-0 border-b border-outline-variant/30 pb-3">
          <div>
            <h2 className="text-h2 font-h2 text-sky-400">DISPATCH HISTORY LOG</h2>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Live broadcast feed of triggered Space Weather alerts.
            </p>
          </div>
          <button
            className="flex items-center gap-1 text-[10px] text-primary border border-primary/30 px-2.5 py-1.5 rounded hover:bg-primary/10 transition-colors"
            onClick={loadData}
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            <span>REFRESH</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-on-surface-variant gap-2 opacity-50 py-10">
              <span className="material-symbols-outlined text-4xl">notifications_off</span>
              <p className="text-label-caps">No alerts triggered yet</p>
              <p className="text-[10px]">Configure webhooks and trigger a PRADAN ingestion sync to evaluate forecasts.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {history.map((alert) => {
                const date = new Date(alert.timestamp);
                const localStr = date.toLocaleDateString() + " " + date.toLocaleTimeString();
                const flareClassColor = 
                  alert.flare_class === "X" 
                    ? "text-rose-500 border-rose-500/20 bg-rose-500/5" 
                    : alert.flare_class === "M" 
                      ? "text-orange-500 border-orange-500/20 bg-orange-500/5" 
                      : "text-yellow-500 border-yellow-500/20 bg-yellow-500/5";

                return (
                  <div
                    key={alert.id}
                    className="p-3.5 glass-panel rounded-lg border border-outline-variant/15 flex flex-col gap-2 hover:border-outline-variant/30 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        {/* Flare Class Badge */}
                        <div className={`w-8 h-8 rounded border flex items-center justify-center font-bold text-sm ${flareClassColor}`}>
                          {alert.flare_class}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-on-surface">
                            {alert.flare_class}-Class Solar Flare Forecast Warning
                          </span>
                          <span className="text-[9px] font-mono text-on-surface-variant">
                            {localStr}
                          </span>
                        </div>
                      </div>
                      <div>
                        {getStatusBadge(alert.status)}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[10px] bg-primary-container/20 rounded p-2 font-mono mt-1 border border-outline-variant/5">
                      <div className="flex flex-col">
                        <span className="text-on-surface-variant/70 uppercase text-[8px]">PROBABILITY</span>
                        <span className="text-sky-400 font-semibold mt-0.5">{(alert.probability * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-on-surface-variant/70 uppercase text-[8px]">HORIZON</span>
                        <span className="text-primary font-semibold mt-0.5">{alert.horizon}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-on-surface-variant/70 uppercase text-[8px]">INTEGRATIONS</span>
                        <div className="flex gap-2 items-center mt-0.5 text-[9px]">
                          <span className={alert.discord_sent ? "text-emerald-400" : "text-on-surface-variant/40"}>Discord</span>
                          <span className="text-on-surface-variant/20">•</span>
                          <span className={alert.slack_sent ? "text-emerald-400" : "text-on-surface-variant/40"}>Slack</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
