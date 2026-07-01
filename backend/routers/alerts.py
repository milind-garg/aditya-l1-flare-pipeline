from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
from pathlib import Path
from src.alerting.alert_sender import (
    load_alert_config,
    save_alert_config,
    HISTORY_PATH,
    send_test_alert
)

router = APIRouter()


class AlertConfigSchema(BaseModel):
    threshold_probability: float
    discord_webhook_url: Optional[str] = ""
    slack_webhook_url: Optional[str] = ""
    email_receiver: Optional[str] = ""
    email_enabled: Optional[bool] = False
    sms_enabled: Optional[bool] = False


class TestAlertSchema(BaseModel):
    webhook_type: str
    url: str


def obfuscate_url(url: str) -> str:
    """Masks a webhook URL to prevent leaking credentials in the frontend."""
    if not url or len(url) < 15:
        return url
    # Keep prefix and add obfuscation
    return f"{url[:15]}..."


@router.get("/alerts/config")
async def get_config():
    """Retrieve current alerting settings with masked webhook URLs."""
    config = load_alert_config()
    # Return a copy with masked URLs
    masked_config = dict(config)
    masked_config["discord_webhook_url"] = obfuscate_url(config.get("discord_webhook_url", ""))
    masked_config["slack_webhook_url"] = obfuscate_url(config.get("slack_webhook_url", ""))
    return masked_config


@router.post("/alerts/config")
async def update_config(payload: AlertConfigSchema):
    """Updates alerting settings, keeping existing webhooks if they were masked."""
    current_config = load_alert_config()
    
    # Process Discord URL
    discord_in = payload.discord_webhook_url
    if discord_in and discord_in.endswith("..."):
        # The user did not modify the masked URL, preserve current
        discord_url = current_config.get("discord_webhook_url", "")
    else:
        discord_url = discord_in or ""
        
    # Process Slack URL
    slack_in = payload.slack_webhook_url
    if slack_in and slack_in.endswith("..."):
        # The user did not modify the masked URL, preserve current
        slack_url = current_config.get("slack_webhook_url", "")
    else:
        slack_url = slack_in or ""

    updated_config = {
        "threshold_probability": max(0.0, min(1.0, payload.threshold_probability)),
        "discord_webhook_url": discord_url,
        "slack_webhook_url": slack_url,
        "email_receiver": payload.email_receiver or "",
        "email_enabled": bool(payload.email_enabled),
        "sms_enabled": bool(payload.sms_enabled)
    }
    
    save_alert_config(updated_config)
    return {"success": True, "message": "Alerting settings saved successfully"}


@router.get("/alerts/history")
async def get_history():
    """Returns the history of triggered alerts from disk."""
    if not HISTORY_PATH.exists():
        return []
    try:
        with open(HISTORY_PATH, "r") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read alert log: {e}")


@router.post("/alerts/test")
async def test_alert(payload: TestAlertSchema):
    """Sends a mock test alert to a specific webhook URL."""
    url = payload.url
    # If masked, load the original from config
    if url.endswith("..."):
        config = load_alert_config()
        if payload.webhook_type.lower() == "discord":
            url = config.get("discord_webhook_url", "")
        elif payload.webhook_type.lower() == "slack":
            url = config.get("slack_webhook_url", "")

    if not url:
        raise HTTPException(status_code=400, detail="Webhook URL is empty or not configured")

    success = send_test_alert(payload.webhook_type, url)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to dispatch test alert to {payload.webhook_type}")
        
    return {"success": True, "message": f"Test alert dispatched successfully to {payload.webhook_type}!"}
