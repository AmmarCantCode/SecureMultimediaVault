from dotenv import load_dotenv; load_dotenv()
import os
class Config:
    SECRET_KEY = "dev-secret"
    SQLALCHEMY_DATABASE_URI = "sqlite:///smv.db"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 25 * 1024 * 1024

    # --- STORAGE_BACKEND = "local"

        # === S3 storage config ===
    S3_BUCKET = os.getenv("S3_BUCKET", "smv-dev-ammarzaki")        # <-- your bucket
    S3_REGION = os.getenv("S3_REGION", "ap-southeast-2")          # <-- your region
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "AKIARCCRJKZZRMID2WNL")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "hMFXN5DO6Kd3EG5zvls6UHptpZ7eo3BY8hBFvwQ3")

    # --- Mailgun (read from environment; do NOT hardcode secrets) ---
    MAILGUN_DOMAIN = os.environ.get("MAILGUN_DOMAIN", "")
    MAILGUN_API_KEY = os.environ.get("MAILGUN_API_KEY", "")
    MAILGUN_BASE_URL = os.environ.get("MAILGUN_BASE_URL", "https://api.mailgun.net")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", f"noreply@{os.environ.get('MAILGUN_DOMAIN','example.com')}")
