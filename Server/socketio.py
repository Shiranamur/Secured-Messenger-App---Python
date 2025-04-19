from flask_socketio import SocketIO, join_room, emit
from flask_jwt_extended import verify_jwt_in_request, get_jwt
from Server.app import create_app

socketio = SocketIO(cors_allowed_origins="*")   # init later

def init_socketio(flask_app):
    socketio.init_app(flask_app)

@socketio.on('ws')
def on_connect():
    # The client sends its JWT in the 'Authorization' header: "Bearer <token>"
    verify_jwt_in_request()
    email = get_jwt()['email']
    join_room(f"user:{email}")

def push_message(to_email, payload):
    socketio.emit('message', payload, room=f"user:{to_email}")
