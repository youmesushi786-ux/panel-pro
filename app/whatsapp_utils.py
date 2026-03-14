# project/app/whatsapp_utils.py
from __future__ import annotations

import os
import logging
from typing import Optional

import requests

logger = logging.getLogger("panelpro.whatsapp")

WHATSAPP_ENABLED = os.getenv("WHATSAPP_ENABLED", "false").lower() == "true"
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")  # e.g. "123456789012345"


def _format_phone_e164(phone: str) -> str:
    """
    Format phone in E.164, e.g. '2547xxxxxxxx' -> '+2547xxxxxxxx'.
    Assumes caller gives international number without plus.
    Adjust if your users type numbers differently.
    """
    phone = phone.strip()
    if phone.startswith('+'):
        return phone
    if phone.startswith('254'):
        return f"+{phone}"
    return phone  # fallback; you can add more rules for your country


def send_whatsapp_message(phone: str, message: str) -> Optional[str]:
    """
    Send a WhatsApp text message using WhatsApp Cloud API.
    Returns message ID on success, or None.
    """
    if not WHATSAPP_ENABLED:
        logger.info("WhatsApp sending disabled (WHATSAPP_ENABLED=false). Skipping.")
        return None

    if not (WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID):
        logger.error("WhatsApp configuration missing. Skipping WhatsApp send.")
        return None

    to_phone = _format_phone_e164(phone)

    url = f"https://graph.facebook.com/v17.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": message},
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        if 200 <= resp.status_code < 300:
            data = resp.json()
            msg_id = data.get("messages", [{}])[0].get("id")
            logger.info("WhatsApp message sent. id=%s to=%s", msg_id, to_phone)
            return msg_id
        else:
            logger.error(
                "Failed to send WhatsApp message. Status=%s Response=%s",
                resp.status_code,
                resp.text,
            )
            return None
    except Exception as exc:  # noqa: BLE001
        logger.exception("Exception while sending WhatsApp message: %s", exc)
        return None