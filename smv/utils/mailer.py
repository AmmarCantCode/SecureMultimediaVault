import requests

# ⚠️ For a real project you would NOT hard-code these.
# You asked me to use your sandbox values directly for your local demo.
MAILGUN_API_KEY = ""
MAILGUN_DOMAIN = ""
MAILGUN_BASE_URL = "https://api.mailgun.net"
MAILGUN_FROM = "Secure Multimedia Vault <>"

def send_otp_email(to_email: str, code: str) -> bool:
    """
    Send OTP email via Mailgun sandbox.
    """
    url = f"{MAILGUN_BASE_URL}/v3/{MAILGUN_DOMAIN}/messages"
    data = {
        "from": MAILGUN_FROM,
        "to": [to_email],   # must be an authorized recipient in the sandbox
        "subject": "Your SMV login code",
        "text": f"Your one-time code is {code}. It expires in 5 minutes."
    }

    resp = requests.post(url, auth=("api", MAILGUN_API_KEY), data=data, timeout=15)
    # If something goes wrong, this will raise and you’ll see it in the terminal
    resp.raise_for_status()
    print(f"[SMV] Mailgun OK {resp.status_code}: {resp.text[:200]}")
    return True

