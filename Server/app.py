from flask import Flask
from flask import render_template
from flask_jwt_extended import JWTManager
from flask_wtf import CSRFProtect
from Server.socket_manager import socketio, init_socketio
from web import auth_bp, home_bp
from api import api_bp
import os
from dotenv import load_dotenv

load_dotenv()

csrf = CSRFProtect()
jwt  = JWTManager()

def create_app():
    app = Flask(__name__, template_folder='web/templates')
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY')
    app.config['JWT_TOKEN_LOCATION'] = os.getenv('JWT_TOKEN_LOCATION')
    app.config['JWT_COOKIE_SECURE'] = os.getenv('JWT_COOKIE_SECURE')
    app.config['JWT_COOKIE_HTTPONLY'] = os.getenv('JWT_COOKIE_HTTPONLY')
    app.config['JWT_COOKIE_SAMESITE'] = os.getenv('JWT_COOKIE_SAMESITE')
    app.config['JWT_ACCESS_CSRF_PROTECT'] = os.getenv('JWT_ACCESS_CSRF_PROTECT')

    init_socketio(app)
    csrf.init_app(app)
    jwt.init_app(app)
    app.register_blueprint(auth_bp)
    app.register_blueprint(home_bp)
    app.register_blueprint(api_bp)


    csrf.exempt(api_bp)

    @app.route('/')
    def index():
        return render_template('index.html')

    return app

if __name__ == '__main__':
    app = create_app()
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)