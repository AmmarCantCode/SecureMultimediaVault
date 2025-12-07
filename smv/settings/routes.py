from flask import Blueprint, render_template, request
from flask_login import login_required, current_user
from ..extensions import db

settings_bp = Blueprint("settings", __name__, template_folder='../../templates')

@settings_bp.route("/")
@login_required
def page():
    return render_template("page_settings.html")

@settings_bp.route("/wizard")
@login_required
def wizard():
    return render_template("page_wizard.html")

@settings_bp.route("/onboarding")
@login_required
def onboarding():
    return render_template("onboarding.html")

@settings_bp.route("/update", methods=["POST"])
@login_required
def update():
    data = request.get_json(silent=True) or {}
    if "display_name" in data:
        current_user.display_name = (data.get("display_name") or "").strip()[:255] or None
    if "trash_retention_days" in data:
        try:
            d = int(data.get("trash_retention_days"))
            current_user.trash_retention_days = max(1, min(365, d))
        except Exception:
            pass
    if "auto_logout_on_close" in data:
        current_user.auto_logout_on_close = bool(data.get("auto_logout_on_close"))
    db.session.commit()
    return {"ok": True}
