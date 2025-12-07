import random
from datetime import datetime, timedelta
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from ..extensions import db, limiter
from ..models import User, Audit
from smv.utils.mailer import send_otp_email


auth_bp = Blueprint("auth", __name__, template_folder='../../templates')

def log(action, status="ok", rid=None):
    from flask import request as rq
    a = Audit(user_id=current_user.id if current_user.is_authenticated else None,
              action=action, status=status, resource_id=rid,
              ip=rq.remote_addr, user_agent=rq.headers.get("User-Agent","")[:250])
    db.session.add(a); db.session.commit()

@auth_bp.route("/register", methods=["GET","POST"])
def register():
    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        pw = request.form.get("password") or ""
        if not email or not pw:
            flash("Email and password are required", "danger"); return redirect(url_for("auth.register"))
        if User.query.filter_by(email=email).first():
            flash("Email already registered", "warning"); return redirect(url_for("auth.register"))
        u = User(email=email, pass_hash=generate_password_hash(pw))
        db.session.add(u); db.session.commit()
        flash("Registered! Please login.", "success")
        return redirect(url_for("auth.login"))
    return render_template("auth_login.html", mode="register")

@limiter.limit("5 per minute")
@auth_bp.route("/login", methods=["GET","POST"])
def login():
    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        pw = request.form.get("password") or ""
        u = User.query.filter_by(email=email).first()
        if not u or not check_password_hash(u.pass_hash, pw):
            log("login_fail", status="fail"); flash("Invalid credentials", "danger"); return redirect(url_for("auth.login"))
        code = f"{random.randint(0,999999):06d}"
        u.otp_code = code; u.otp_expires = datetime.utcnow() + timedelta(minutes=5); db.session.commit()
        sent = send_otp_email(u.email, code)
        if not sent:
            # still print to console for local dev fallback
            print(f"[SMV DEMO] OTP for {u.email}: {code} (valid 5 minutes)")
        return redirect(url_for("auth.otp", email=u.email))
    return render_template("auth_login.html", mode="login")

@auth_bp.route("/otp", methods=["GET","POST"])
def otp():
    email = request.args.get("email") or request.form.get("email")
    u = User.query.filter_by(email=email).first()
    if not u:
        flash("Session expired. Please login.", "warning"); return redirect(url_for("auth.login"))
    if request.method == "POST":
        code = (request.form.get("code") or "").strip()
        if u.otp_code and u.otp_expires and u.otp_expires >= datetime.utcnow() and code == u.otp_code:
            login_user(u); u.otp_code = None; db.session.commit(); log("login_success"); return redirect(url_for("files.dashboard"))
        flash("Invalid or expired OTP", "danger")
    return render_template("otp.html", email=email)

@auth_bp.route("/logout", methods=["POST","GET"])
def logout():
    if current_user.is_authenticated:
        logout_user(); log("logout")
    return redirect(url_for("auth.login"))

# Key endpoints
@auth_bp.route("/key/status")
@login_required
def key_status():
    u = current_user
    return {"has_keys": bool(u.public_key_pem and u.enc_private_key_b64 and u.kdf_salt_b64), "kdf_iters": u.kdf_iters}

@auth_bp.route("/key/status/full")
@login_required
def key_status_full():
    u = current_user
    return {"has_keys": bool(u.public_key_pem and u.enc_private_key_b64 and u.kdf_salt_b64),
            "public_key_pem": u.public_key_pem, "enc_private_key_b64": u.enc_private_key_b64,
            "kdf_salt_b64": u.kdf_salt_b64, "kdf_iters": u.kdf_iters}

@auth_bp.route("/key/bootstrap", methods=["POST"])
@login_required
def key_bootstrap():
    data = request.get_json(silent=True) or {}
    need = ["public_key_pem","enc_private_key_b64","kdf_salt_b64"]
    if not all(data.get(k) for k in need): return {"ok": False, "error": "missing fields"}, 400
    u = current_user
    u.public_key_pem = data["public_key_pem"]; u.enc_private_key_b64 = data["enc_private_key_b64"]; u.kdf_salt_b64 = data["kdf_salt_b64"]; u.kdf_iters = int(data.get("kdf_iters") or 200000)
    db.session.commit()
    return {"ok": True}

@auth_bp.route("/me")
@login_required
def me():
    u = current_user
    return {"email": u.email, "display_name": u.display_name or u.email.split("@")[0].capitalize(), "trash_retention_days": u.trash_retention_days or 30, "auto_logout_on_close": bool(u.auto_logout_on_close)}
