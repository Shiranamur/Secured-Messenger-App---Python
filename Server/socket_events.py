from flask import request
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity
from flask_socketio import join_room, emit
from Server.database import get_db_cnx


user_sessions = {} # Dictionary to store user sessions

def register_handlers(socketio):
    @socketio.on('connect')
    def handle_connect():
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        user_sessions[user_id] = request.sid
        join_room(user_id)
        print(f"User {user_id} connected with socket ID {request.sid}")


    @socketio.on('disconnect')
    def handle_disconnect():
        # Remove user from tracking
        for user_id, sid in list(user_sessions.items()):
            if sid == request.sid:
                del user_sessions[user_id]
                break


    def get_user_socket_id(user_id):
        return user_sessions.get(user_id)

    
    @socketio.on('send_message')
    def handle_send_message(data):
        verify_jwt_in_request()
        jwt_data = get_jwt()
        sender_email = jwt_data["email"]

        receiver_email = data.get("receiver")
        blob = data.get("ciphertext")
        msg_type = data.get("msg_type", "message")

        cnx = None
        cur = None
        try:
            cnx = get_db_cnx()
            cur = cnx.cursor()
            cur.execute(
                "INSERT INTO messages (sender_email, receiver_email, content)"
                " VALUES (%s, %s, %s)",
                (sender_email, receiver_email, blob)
            )
            cnx.commit()
            message_id = cur.lastrowid

            # Push to receiver if online
            socketio.emit('message', {
                "from": sender_email,
                "ciphertext": blob,
                "msg_type": msg_type,
                "id": message_id
            }, room=receiver_email)

            # Acknowledge successful send
            emit('message_sent', {"status": "sent", "id": message_id})

        except Exception as e:
            if cnx: cnx.rollback()
            print(e)
            emit('error', {"error": "Failed to send message"})
        finally:
            if cur: cur.close()
            if cnx: cnx.close()
