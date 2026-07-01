"""Space Weather Alerting Engine: Handles Slack/Discord webhook broadcasts and logging."""

import json
import os
from pathlib import Path
import datetime
import urllib.request

CONFIG_PATH = Path("config/alert_config.json")
HISTORY_PATH = Path("data/processed/triggered_alerts.json")


def load_alert_config() -> dict:
    """Loads the alerting configuration from alert_config.json."""
    default_config = {
        "threshold_probability": 0.50,
        "discord_webhook_url": "",
        "slack_webhook_url": "",
        "email_receiver": "",
        "email_enabled": False,
        "sms_enabled": False
    }
    if not CONFIG_PATH.exists():
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        save_alert_config(default_config)
        return default_config
    try:
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading config, using default: {e}")
        return default_config


def save_alert_config(config: dict) -> None:
    """Saves the alerting configuration to alert_config.json."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)


def log_triggered_alert(alert_entry: dict) -> None:
    """Logs a triggered alert event to the history JSON file."""
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    history = []
    if HISTORY_PATH.exists():
        try:
            with open(HISTORY_PATH, "r") as f:
                history = json.load(f)
        except Exception as e:
            print(f"Error loading alert history: {e}")
            history = []
            
    # Append the new entry at the beginning
    history.insert(0, alert_entry)
    
    # Cap history at 100 entries
    history = history[:100]
    
    with open(HISTORY_PATH, "w") as f:
        json.dump(history, f, indent=2)


def dispatch_webhook(url: str, payload: dict) -> bool:
    """Dispatches a JSON POST payload to a webhook URL using urllib."""
    if not url:
        return False
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "SolarGuard-L1-Alerter"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=8) as res:
            status_code = res.status
            return 200 <= status_code < 300
    except Exception as e:
        print(f"Failed to dispatch webhook to {url}: {e}")
        return False


def format_discord_payload(flare_class: str, probability: float, timestamp: str, horizon: str) -> dict:
    """Formats a beautiful rich embeds layout for Discord alerts."""
    # Convert flare class to correct color (Red for X, Orange for M, Yellow for C)
    color = 15548997 if flare_class == "X" else 15105570 if flare_class == "M" else 16580367
    
    return {
        "content": "⚠️ 🚨 **CRITICAL SPACE WEATHER WARNING** 🚨 ⚠️",
        "embeds": [
            {
                "title": f"Aditya-L1 Solar Flare Forecast: {flare_class}-Class Warning",
                "description": f"The forecasting pipeline has detected a high probability of a **{flare_class}-Class** solar flare event.",
                "color": color,
                "fields": [
                    {"name": "Forecast Horizon", "value": f"Next {horizon}", "inline": True},
                    {"name": "Trigger Probability", "value": f"{probability * 100:.1f}%", "inline": True},
                    {"name": "Aditya-L1 Payload Stream", "value": "SoLEXS (Soft X-Ray) + HEL1OS (Hard X-Ray)", "inline": False},
                    {"name": "Operational Advisory", "value": "Grid operators and satellite operations flight control teams: monitor magnetosphere and payload telemetry for particle event onset.", "inline": False}
                ],
                "timestamp": timestamp,
                "footer": {
                    "text": "SolarGuard L1 Space Weather Alerting System • ISRO Bharatiya Antariksh Hackathon"
                }
            }
        ]
    }


def format_slack_payload(flare_class: str, probability: float, timestamp: str, horizon: str) -> dict:
    """Formats standard Slack rich text warning blocks."""
    emoji = "🔴" if flare_class == "X" else "🟠" if flare_class == "M" else "🟡"
    return {
        "text": f"🚨 *SPACE WEATHER ALERT*: {flare_class}-Class Flare Predicted! 🚨",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"🚨 *SPACE WEATHER WARNING* 🚨\n*Aditya-L1 Forecast Model Warning*\nHigh probability of a *{flare_class}-Class* solar flare predicted in the next {horizon}."
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Trigger Probability:*\n{probability * 100:.1f}%"},
                    {"type": "mrkdwn", "text": f"*Forecast Horizon:*\n{horizon}"},
                    {"type": "mrkdwn", "text": f"*Detection Source:*\nAditya-L1 Telemetry"},
                    {"type": "mrkdwn", "text": f"*Timestamp (UTC):*\n{timestamp}"}
                ]
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": "SolarGuard L1 Alerter Service • Flight operations advisory active."}
                ]
            }
        ]
    }


def send_alert_notifications(flare_class: str, probability: float, timestamp: str = None, horizon: str = "15-30 minutes") -> dict:
    """Triggers and dispatches notifications for high-probability flare predictions.
    
    Includes cooldown logic (60 minutes per flare class) to prevent alert storms.
    """
    if timestamp is None:
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
    config = load_alert_config()
    
    # Cooldown Check (check if we sent an alert of this class in the last 60 minutes)
    history = []
    if HISTORY_PATH.exists():
        try:
            with open(HISTORY_PATH, "r") as f:
                history = json.load(f)
        except Exception:
            pass
            
    recent_alerts = [
        h for h in history 
        if h.get("flare_class") == flare_class 
        and h.get("status") == "SENT"
    ]
    
    cooldown_active = False
    if recent_alerts:
        last_alert_time = datetime.datetime.fromisoformat(recent_alerts[0]["timestamp"].replace("Z", "+00:00"))
        now_time = datetime.datetime.now(datetime.timezone.utc)
        diff_minutes = (now_time - last_alert_time).total_seconds() / 60.0
        if diff_minutes < 60:
            cooldown_active = True
            print(f"Alert cooldown active for {flare_class}-Class (last alert sent {diff_minutes:.1f} mins ago). Skipping webhooks.")

    alert_entry = {
        "id": f"alert_{int(datetime.datetime.now().timestamp())}",
        "timestamp": timestamp,
        "flare_class": flare_class,
        "probability": probability,
        "horizon": horizon,
        "status": "COOLDOWN" if cooldown_active else "PENDING",
        "slack_sent": False,
        "discord_sent": False
    }

    if not cooldown_active:
        discord_url = config.get("discord_webhook_url", "")
        slack_url = config.get("slack_webhook_url", "")
        
        # Dispatch Discord
        if discord_url:
            discord_payload = format_discord_payload(flare_class, probability, timestamp, horizon)
            alert_entry["discord_sent"] = dispatch_webhook(discord_url, discord_payload)
            
        # Dispatch Slack
        if slack_url:
            slack_payload = format_slack_payload(flare_class, probability, timestamp, horizon)
            alert_entry["slack_sent"] = dispatch_webhook(slack_url, slack_payload)
            
        alert_entry["status"] = "SENT" if (alert_entry["discord_sent"] or alert_entry["slack_sent"]) else "FAILED"
        # If no webhooks configured, mark as "LOGGED"
        if not discord_url and not slack_url:
            alert_entry["status"] = "LOGGED"
            
    log_triggered_alert(alert_entry)
    return alert_entry


def send_test_alert(webhook_type: str, url: str) -> bool:
    """Dispatches a mock test alert immediately to a specific webhook to verify connection."""
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    mock_class = "X"
    mock_prob = 0.88
    mock_horizon = "15-30 minutes"
    
    if webhook_type.lower() == "discord":
        payload = format_discord_payload(mock_class, mock_prob, timestamp, mock_horizon)
        # Modify visual for test
        payload["content"] = "🧪 **ADITYA-L1 ALERT SYSTEM: TEST CONNECTION** 🧪"
        payload["embeds"][0]["title"] = "Aditya-L1 Alert System Webhook Connection Verified"
        payload["embeds"][0]["description"] = "This is a simulated test broadcast to verify your Discord channel webhook endpoint is active."
        return dispatch_webhook(url, payload)
        
    elif webhook_type.lower() == "slack":
        payload = format_slack_payload(mock_class, mock_prob, timestamp, mock_horizon)
        payload["text"] = "🧪 *ALERT SYSTEM: WEBHOOK TEST CONNECTION* 🧪"
        payload["blocks"][0]["text"]["text"] = "🧪 *ALERT SYSTEM TEST* 🧪\nThis is a simulated test broadcast to verify your Slack channel webhook endpoint is active."
        return dispatch_webhook(url, payload)
        
    return False


if __name__ == "__main__":
    # Test alerting locally
    print("Testing alerting engine locally...")
    res = send_alert_notifications("X", 0.94)
    print("Logged alert:", json.dumps(res, indent=2))
