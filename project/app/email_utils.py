# project/app/email_utils.py
from __future__ import annotations

import os
import logging
from typing import Optional, Iterable, Tuple, Any
import base64
import requests

logger = logging.getLogger("panelpro.email")

# Attachment type: (filename, data_bytes, mime_type)
Attachment = Tuple[str, bytes, str]

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
FROM_EMAIL = os.getenv("FROM_EMAIL")
COMPANY_EMAIL = os.getenv("COMPANY_EMAIL", FROM_EMAIL)


def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    attachments: Optional[Iterable[Attachment]] = None,
) -> None:
    """
    Send an email using Resend's HTTP API.
    attachments: iterable of (filename, data_bytes, mime_type)
    """
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY is not set; cannot send email.")
    if not FROM_EMAIL:
        raise RuntimeError("FROM_EMAIL is not set; cannot send email.")

    text_body = text_body or "Please view this email in an HTML-capable client."

    data: dict[str, Any] = {
        "from": FROM_EMAIL,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }

    if attachments:
        # Resend supports attachments; format: [{"filename":..., "content":..., "contentType":...}]
        resend_attachments = []
        for filename, file_bytes, mime_type in attachments:
            resend_attachments.append(
                {
                    "filename": filename,
                    "content": base64.b64encode(file_bytes).decode("ascii"),
                    "contentType": mime_type,
                }
            )
        data["attachments"] = resend_attachments

    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }

    resp = requests.post(
        "https://api.resend.com/emails", json=data, headers=headers, timeout=10
    )
    if 200 <= resp.status_code < 300:
        logger.info("Email sent via Resend to %s subject=%s", to_email, subject)
    else:
        logger.error(
            "Failed to send email via Resend. Status=%s Response=%s",
            resp.status_code,
            resp.text,
        )
        raise RuntimeError(f"Resend error: {resp.status_code} {resp.text}")