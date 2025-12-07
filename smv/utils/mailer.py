import requests

# ⚠️ For a real project you would NOT hard-code these.
# You asked me to use your sandbox values directly for your local demo.
MAILGUN_API_KEY = "4f1a55c055f00bda8d79de7268a9a0ff-88b1ca9f-64ce1516"
MAILGUN_DOMAIN = "sandbox2d2c89d2f2c048dc917b8315b14223ed.mailgun.org"
MAILGUN_BASE_URL = "https://api.mailgun.net"
MAILGUN_FROM = "Secure Multimedia Vault <postmaster@sandbox2d2c89d2f2c048dc917b8315b14223ed.mailgun.org>"

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
