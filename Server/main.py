# In Server/main.py
from flask import Flask, render_template
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from Server.auth import auth_bp
from Server.api import api_bp
from Server.home import home_bp

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.register_blueprint(auth_bp)
app.register_blueprint(home_bp)
app.register_blueprint(api_bp)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)
