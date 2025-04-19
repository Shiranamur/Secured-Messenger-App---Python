from flask import Flask
from flask_jwt_extended import JWTManager
from flask_wtf import CSRFProtect
from web import auth_bp, home_bp
from api import api_bp
from config.config import Config

csrf = CSRFProtect()
jwt  = JWTManager()

def create_app():
    app = Flask(__name__, template_folder='web/templates')
    app.config.from_object(Config)

    csrf.init_app(app)
    jwt.init_app(app)
    app.register_blueprint(auth_bp)
    app.register_blueprint(home_bp)
    app.register_blueprint(api_bp)

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)
