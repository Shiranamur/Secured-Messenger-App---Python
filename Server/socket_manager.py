from flask_socketio import SocketIO

# Create socketio instance but don't initialize yet
socketio = SocketIO()


def init_socketio(app):
    # Initialize with the app
    socketio.init_app(app, cors_allowed_origins="*")

    # Import event handlers here to avoid circular imports
    from Server.socket_events import register_handlers
    register_handlers(socketio)