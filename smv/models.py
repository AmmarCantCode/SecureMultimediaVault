from datetime import datetime
from flask_login import UserMixin
from .extensions import db, login_manager

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    pass_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # OTP (demo)
    otp_code = db.Column(db.String(6))
    otp_expires = db.Column(db.DateTime)

    # Keys
    public_key_pem = db.Column(db.Text)
    enc_private_key_b64 = db.Column(db.Text)
    kdf_salt_b64 = db.Column(db.String(64))
    kdf_iters = db.Column(db.Integer, default=200000)

    # Settings
    display_name = db.Column(db.String(255))
    trash_retention_days = db.Column(db.Integer, default=30)
    auto_logout_on_close = db.Column(db.Boolean, default=False)

@login_manager.user_loader
def load_user(uid):
    try: return User.query.get(int(uid))
    except Exception: return None

class File(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    mime = db.Column(db.String(120))
    size = db.Column(db.Integer)
    storage_path = db.Column(db.String(512), nullable=False)

    wrapped_key_b64 = db.Column(db.Text, nullable=False)
    iv_b64 = db.Column(db.String(64), nullable=False)

    has_thumb = db.Column(db.Boolean, default=False)
    iv_thumb_b64 = db.Column(db.String(64))
    thumb_path = db.Column(db.String(512))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_deleted = db.Column(db.Boolean, default=False)
    deleted_at = db.Column(db.DateTime)

class Audit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer)
    action = db.Column(db.String(40))
    status = db.Column(db.String(20), default="ok")
    resource_id = db.Column(db.Integer)
    ip = db.Column(db.String(64))
    user_agent = db.Column(db.String(255))
    ts = db.Column(db.DateTime, default=datetime.utcnow)
