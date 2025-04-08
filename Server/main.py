from flask import Flask, render_template

from Server.auth import auth_bp
from Server.api import api_bp
from Server.home import home_bp
from config.config import Config

app = Flask(__name__)
app.config.from_object(Config)
app.register_blueprint(auth_bp)
app.register_blueprint(home_bp)
app.register_blueprint(api_bp)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)
