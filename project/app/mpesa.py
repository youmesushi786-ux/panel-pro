from __future__ import annotations

import base64
from datetime import datetime
from typing import Dict, Any

import httpx

from app.config import (
    MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET,
    MPESA_PASSKEY,
    MPESA_SHORTCODE,
    MPESA_ENV,
    MPESA_CALLBACK_URL,
)

# Choose base URL based on sandbox/production
if MPESA_ENV == "production":
    MPESA_BASE_URL = "https://api.safaricom.co.ke"
else:
    MPESA_BASE_URL = "https://sandbox.safaricom.co.ke"


async def get_access_token() -> str:
    """
    Get OAuth access token from Daraja.
    """
    if not MPESA_CONSUMER_KEY or not MPESA_CONSUMER_SECRET:
        raise RuntimeError("MPESA_CONSUMER_KEY/SECRET not configured")

    async with httpx.AsyncClient(
        auth=(MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET), timeout=30
    ) as client:
        resp = await client.get(
            f"{MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials"
        )
        resp.raise_for_status()
        data = resp.json()
        return data["access_token"]


def generate_password(timestamp: str) -> str:
    """
    Generate base64-encoded password: ShortCode + Passkey + Timestamp
    """
    raw = f"{MPESA_SHORTCODE}{MPESA_PASSKEY}{timestamp}"
    return base64.b64encode(raw.encode()).decode()


async def initiate_stk_push(
    order_id: str,
    phone_number: str,
    amount: float,
    account_reference: str | None = None,
    description: str | None = None,
) -> Dict[str, Any]:
    """
    Initiate M-Pesa STK push (Lipa na M-Pesa Online).
    Returns the raw Daraja response (contains CheckoutRequestID).
    """
    token = await get_access_token()
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    password = generate_password(timestamp)

    payload = {
        "BusinessShortCode": MPESA_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": int(round(amount)),
        "PartyA": phone_number,
        "PartyB": MPESA_SHORTCODE,
        "PhoneNumber": phone_number,
        "CallBackURL": MPESA_CALLBACK_URL,
        "AccountReference": account_reference or order_id,
        "TransactionDesc": description or f"PanelPro order {order_id}",
    }

    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()