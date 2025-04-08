from flask import Flask, render_template

from Server.auth import auth_bp

app = Flask(__name__)
app.register_blueprint(auth_bp)
@app.route('/')
def home():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)
