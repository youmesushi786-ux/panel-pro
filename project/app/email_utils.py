import os
import smtplib
from email.message import EmailMessage
from typing import Optional, Iterable, Tuple

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)
COMPANY_EMAIL = os.getenv("COMPANY_EMAIL", SMTP_USER)

# Attachment type: (filename, data_bytes, mime_type)
Attachment = Tuple[str, bytes, str]


def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    attachments: Optional[Iterable[Attachment]] = None,
) -> None:
    """
    Send an HTML email (optionally with attachments) using SMTP env settings.

    attachments: iterable of (filename, data_bytes, mime_type)
                 e.g. ("report.pdf", b"...", "application/pdf")
    """
    if not (SMTP_HOST and SMTP_PORT and SMTP_USER and SMTP_PASS and FROM_EMAIL):
        raise RuntimeError("SMTP configuration missing; check environment variables.")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email

    # Plain text fallback
    text_body = text_body or "Please view this email in an HTML-capable client."
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    # Attach files
    if attachments:
        for filename, data, mime_type in attachments:
            maintype, subtype = mime_type.split("/", 1)
            msg.add_attachment(
                data,
                maintype=maintype,
                subtype=subtype,
                filename=filename,
            )

    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as smtp:
        smtp.login(SMTP_USER, SMTP_PASS)
        smtp.send_message(msg)