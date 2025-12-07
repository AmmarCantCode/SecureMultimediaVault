from flask import Blueprint, render_template
from flask_login import login_required, current_user
from ..models import Audit

audit_bp = Blueprint("audit", __name__, template_folder='../../templates')

@audit_bp.route("/recent")
@login_required
def recent():
    rows = Audit.query.filter_by(user_id=current_user.id).order_by(Audit.ts.desc()).limit(5).all()
    return [{"ts": r.ts.isoformat(), "action": r.action, "status": r.status, "resource_id": r.resource_id} for r in rows]

@audit_bp.route("/")
@login_required
def view():
    rows = Audit.query.order_by(Audit.ts.desc()).limit(200).all()
    return render_template("audit.html", rows=rows)
