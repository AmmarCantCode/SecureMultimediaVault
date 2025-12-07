import uuid
from io import BytesIO
from werkzeug.utils import secure_filename
from flask import Blueprint, render_template, request, jsonify, send_file, abort, redirect, url_for, flash
from flask_login import login_required, current_user
from ..extensions import db
from ..models import File, Audit
from smv.utils.storage import (
    storage_save,
    storage_get_bytes,
    storage_exists,
    storage_delete,
    # storage_rename,  # keep for future if you want rename via storage
)

files_bp = Blueprint("files", __name__, template_folder='../../templates')


def log(action, status="ok", rid=None):
    from flask import request as rq
    a = Audit(
        user_id=current_user.id if current_user.is_authenticated else None,
        action=action,
        status=status,
        resource_id=rid,
        ip=rq.remote_addr,
        user_agent=rq.headers.get("User-Agent", "")[:250],
    )
    db.session.add(a)
    db.session.commit()


def needs_wizard():
    return not (
        current_user.public_key_pem
        and current_user.enc_private_key_b64
        and current_user.kdf_salt_b64
    )


@files_bp.route("/dashboard")
@login_required
def dashboard():
    if needs_wizard():
        flash("Let's finish your setup.", "warning")
        return redirect(url_for("settings.onboarding"))
    return render_template("page_dashboard.html")


@files_bp.route("/files")
@login_required
def page_files():
    if needs_wizard():
        flash("Please complete setup first.", "warning")
        return redirect(url_for("settings.onboarding"))
    return render_template("page_files.html")


@files_bp.route("/upload")
@login_required
def page_upload():
    if needs_wizard():
        flash("Please complete setup first.", "warning")
        return redirect(url_for("settings.onboarding"))
    return render_template("page_upload.html")


@files_bp.route("/list")
@login_required
def list_files():
    show_trash = request.args.get("trash") == "1"
    q = File.query.filter_by(owner_id=current_user.id)
    if show_trash:
        q = q.filter_by(is_deleted=True)
    else:
        q = q.filter((File.is_deleted == False) | (File.is_deleted.is_(None)))
    rows = q.order_by(File.created_at.desc()).all()
    return jsonify(
        [
            {
                "id": f.id,
                "filename": f.filename,
                "mime": f.mime,
                "size": f.size,
                "has_thumb": f.has_thumb,
                "created_at": f.created_at.isoformat(),
                "is_deleted": bool(getattr(f, "is_deleted", False)),
            }
            for f in rows
        ]
    )


@files_bp.route("/stats")
@login_required
def stats():
    from sqlalchemy import func

    total = (
        db.session.query(func.count(File.id))
        .filter_by(owner_id=current_user.id)
        .scalar()
        or 0
    )
    size = (
        db.session.query(func.coalesce(func.sum(File.size), 0))
        .filter_by(owner_id=current_user.id)
        .scalar()
        or 0
    )
    trashed = (
        db.session.query(func.count(File.id))
        .filter_by(owner_id=current_user.id, is_deleted=True)
        .scalar()
        or 0
    )
    return {"total": int(total), "size": int(size), "trashed": int(trashed)}


@files_bp.route("/meta/<int:file_id>")
@login_required
def meta(file_id):
    f = File.query.filter_by(id=file_id, owner_id=current_user.id).first()
    if not f:
        abort(404)
    return {
        "id": f.id,
        "filename": f.filename,
        "mime": f.mime,
        "size": f.size,
        "wrapped_key_b64": f.wrapped_key_b64,
        "iv_b64": f.iv_b64,
        "has_thumb": f.has_thumb,
        "iv_thumb_b64": f.iv_thumb_b64,
    }


@files_bp.route("/upload", methods=["POST"])
@login_required
def upload():
    if needs_wizard():
        return jsonify({"ok": False, "error": "Setup incomplete"}), 400

    fblob = request.files.get("file_blob")
    filename = request.form.get("filename") or ""
    mime = request.form.get("mime") or ""
    size = int(request.form.get("size") or 0)
    wrapped_key_b64 = request.form.get("wrapped_key_b64")
    iv_b64 = request.form.get("iv_b64")
    if not fblob or not filename or not wrapped_key_b64 or not iv_b64:
        return {"ok": False, "error": "missing fields"}, 400

    # Generate a logical key for this user's encrypted blob
    fid = str(uuid.uuid4())
    blob_key = f"{current_user.id}/{fid}.bin"

    # Read bytes and save via storage API
    enc_bytes = fblob.read()
    storage_save(blob_key, enc_bytes, content_type=mime or "application/octet-stream")

    has_thumb = False
    iv_thumb_b64 = None
    thumb_key = None

    if request.form.get("has_thumb") == "1":
        tblob = request.files.get("thumb_blob")
        ivt = request.form.get("iv_thumb_b64")
        if tblob and ivt:
            has_thumb = True
            iv_thumb_b64 = ivt
            thumb_key = f"{current_user.id}/{fid}_thumb.bin"
            storage_save(thumb_key, tblob.read(), content_type="image/png")

    safe = secure_filename(filename) or "file"
    if len(safe) > 255:
        safe = safe[:255]

    rec = File(
        owner_id=current_user.id,
        filename=safe,
        mime=mime,
        size=size,
        storage_path=blob_key,  # key in storage backend
        wrapped_key_b64=wrapped_key_b64,
        iv_b64=iv_b64,
        has_thumb=has_thumb,
        iv_thumb_b64=iv_thumb_b64,
        thumb_path=thumb_key if thumb_key else None,
    )
    db.session.add(rec)
    db.session.commit()
    log("file_upload", rid=rec.id)
    return {"ok": True, "id": rec.id}


@files_bp.route("/<int:file_id>/rename", methods=["POST"])
@login_required
def rename(file_id):
    f = File.query.filter_by(id=file_id, owner_id=current_user.id).first()
    if not f:
        abort(404)
    data = request.get_json(silent=True) or {}
    new = (data.get("filename") or "").strip()
    if not new:
        return {"ok": False, "error": "Filename cannot be empty."}, 400
    safe = secure_filename(new)[:255] or f.filename
    f.filename = safe
    db.session.commit()
    log("file_rename", rid=f.id)
    return {"ok": True, "filename": safe}


@files_bp.route("/<int:file_id>", methods=["DELETE"])
@login_required
def trash(file_id):
    f = File.query.filter_by(id=file_id, owner_id=current_user.id).first()
    if not f:
        abort(404)
    from datetime import datetime as _dt

    f.is_deleted = True
    f.deleted_at = _dt.utcnow()
    db.session.commit()
    log("file_trash", rid=f.id)
    return {"ok": True}


@files_bp.route("/<int:file_id>/restore", methods=["POST"])
@login_required
def restore(file_id):
    f = File.query.filter_by(id=file_id, owner_id=current_user.id).first()
    if not f:
        abort(404)
    f.is_deleted = False
    f.deleted_at = None
    db.session.commit()
    log("file_restore", rid=f.id)
    return {"ok": True}


@files_bp.route("/<int:file_id>/purge", methods=["DELETE"])
@login_required
def purge(file_id):
    f = File.query.filter_by(id=file_id, owner_id=current_user.id).first()
    if not f:
        abort(404)

    # hard delete from storage backend
    try:
        if f.storage_path:
            storage_delete(f.storage_path)
    except Exception:
        pass

    try:
        if f.thumb_path:
            storage_delete(f.thumb_path)
    except Exception:
        pass

    fid = f.id
    db.session.delete(f)
    db.session.commit()
    log("file_purge", rid=fid)
    return {"ok": True}


@files_bp.route("/<int:file_id>/download")
@login_required
def download(file_id):
    f = File.query.filter_by(id=file_id, owner_id=current_user.id).first()
    if not f or getattr(f, "is_deleted", False):
        abort(404)
    if not f.storage_path or not storage_exists(f.storage_path):
        abort(404)

    data = storage_get_bytes(f.storage_path)
    log("file_download", rid=f.id)

    return send_file(
        BytesIO(data),
        as_attachment=True,
        download_name=f.filename,
        mimetype=f.mime or "application/octet-stream",
    )


@files_bp.route("/<int:file_id>/thumb")
@login_required
def thumb(file_id):
    f = File.query.filter_by(id=file_id, owner_id=current_user.id).first()
    if (
        not f
        or getattr(f, "is_deleted", False)
        or not f.has_thumb
        or not f.thumb_path
    ):
        abort(404)
    if not storage_exists(f.thumb_path):
        abort(404)

    data = storage_get_bytes(f.thumb_path)
    return send_file(
        BytesIO(data),
        as_attachment=False,
        mimetype="image/png",
    )
