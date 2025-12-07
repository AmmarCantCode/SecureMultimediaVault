from dotenv import load_dotenv
load_dotenv()

from flask import Flask, redirect, url_for
from flask_login import current_user
from sqlalchemy import inspect, text
from smv.extensions import db, login_manager, limiter, talisman
from config import Config

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    csp = {
        "default-src": "'self'",
        "script-src": "'self'",
        "style-src": "'self' 'unsafe-inline'",
        "img-src": "'self' data: blob:",
    }
    talisman.init_app(app, content_security_policy=csp, force_https=False)
    limiter.init_app(app)
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message_category = "warning"

    with app.app_context():
        from smv.auth.routes import auth_bp
        from smv.files.routes import files_bp
        from smv.settings.routes import settings_bp
        from smv.audit.routes import audit_bp

        app.register_blueprint(auth_bp, url_prefix="/auth")
        app.register_blueprint(files_bp, url_prefix="/files")
        app.register_blueprint(settings_bp, url_prefix="/settings")
        app.register_blueprint(audit_bp, url_prefix="/audit")

        db.create_all()

        # minimal migrations if running on an existing DB
        try:
            insp = inspect(db.engine)
            # add soft-delete columns if missing
            if 'file' in insp.get_table_names():
                cols = {c['name'] for c in insp.get_columns('file')}
                if 'is_deleted' not in cols:
                    db.session.execute(text("ALTER TABLE file ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
                if 'deleted_at' not in cols:
                    db.session.execute(text("ALTER TABLE file ADD COLUMN deleted_at DATETIME"))
                db.session.commit()
        except Exception:
            pass

    @app.route("/")
    def home():
        if current_user.is_authenticated:
            return redirect(url_for("files.dashboard"))
        return redirect(url_for("auth.login"))

    return app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
