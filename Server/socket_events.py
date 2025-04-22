from flask import request
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity, jwt_required
from flask_socketio import join_room, emit
from Server.database import get_db_cnx, get_id_from_email, messaging_waiting, mark_messages_as_read_in_db
import json

user_sessions = {} # Dictionary to store user sessions

def register_handlers(socketio):

    @jwt_required()
    @socketio.on('connect')
    def handle_connect():
        verify_jwt_in_request()
        user_id_str = str(get_jwt_identity())
        user_sessions[user_id_str] = request.sid
        join_room(user_id_str)
        print(f"User {user_id_str} connected with socket ID {request.sid}")

    @jwt_required()
    @socketio.on('disconnect')
    def handle_disconnect():
        # Remove user from tracking
        for user_id, sid in list(user_sessions.items()):
            if sid == request.sid:
                del user_sessions[user_id]
                break

    @jwt_required()
    @socketio.on('send_message')
    def handle_send_message(data):
        verify_jwt_in_request()
        jwt_data = get_jwt()
        sender_email = jwt_data["email"]
        print(f"Sender email: {sender_email} - {request.sid} - {data}")

        receiver_email = data.get("receiver")
        encrypted_data = data.get("ciphertext")  # This is now a complex object
        msg_type = data.get("msg_type", "message")

        encrypted_json = json.dumps(encrypted_data)

        cnx = None
        cur = None
        try:
            cnx = get_db_cnx()
            cur = cnx.cursor()
            cur.execute(
                "INSERT INTO messages (sender_email, receiver_email, content)"
                " VALUES (%s, %s, %s)",
                (sender_email, receiver_email, encrypted_json)
            )
            cnx.commit()
            message_id = cur.lastrowid
            print(f"Message id: {message_id} trying to send to : {receiver_email}")

            # Notify recipient through socket
            socketio.emit('message', {
                "from": sender_email,
                "ciphertext": encrypted_data,  # Preserve the original structure
                "msg_type": msg_type,
                "id": message_id
            }, room=get_user_socket_id(get_id_from_email(receiver_email)))

            # Acknowledge successful message sending
            emit('message_sent', {
                "status": "success",
                "messageId": message_id
            })
        except Exception as e:
            if cnx:
                cnx.rollback()
            print(f"Error sending message: {e}")
            emit('message_sent', {
                'status': 'error',
                'error': str(e)
            })
        finally:
            if cur: cur.close()
            if cnx: cnx.close()

    # socket_events.py - Add this new handler
    @jwt_required()
    @socketio.on('message_received')
    def handle_message_received(data):
        message_id = data.get("messageId")
        sender_email = data.get("sender")

        # Update message status in database
        cnx = get_db_cnx()
        try:
            cur = cnx.cursor()
            cur.execute(
                "UPDATE messages SET is_delivered = TRUE WHERE id = %s",
                (message_id,)
            )
            cnx.commit()

            # Notify sender of delivery
            socketio.emit('delivery_confirmation', {
                "messageId": message_id,
                "status": "delivered"
            }, room=get_user_socket_id(get_id_from_email(sender_email)))
        except Exception as e:
            print(f"Error updating message status: {e}")
        finally:
            if cnx: cnx.close()

    @jwt_required()
    @socketio.on('load_undelivered_messages')
    def handle_load_undelivered_messages(data):
        verify_jwt_in_request()
        user_email = get_jwt()["email"]
        contact_email = data.get("contact_email")

        if not contact_email:
            emit('error', {"error": "Contact email is missing"})
            return
        undelivered_messages = messaging_waiting(user_email, contact_email)

        if undelivered_messages:
            emit('messages_load', {"messages": undelivered_messages})

    @jwt_required()
    @socketio.on('mark_messages_as_read')
    def handle_mark_messages_as_read(data):
        verify_jwt_in_request()
        user_email = get_jwt()["email"]
        contact_email = data.get("contact_email")

        if not contact_email:
            emit('error', {"error": "Contact email is missing"})
            return
        mark_messages_as_read_in_db(user_email, contact_email)

    @socketio.on('ratchet_response')
    @jwt_required()
    def handle_ratchet_response(data):
        sender_email = get_jwt()["email"]
        recipient_email = data.get('to')
        ratchet_key = data.get('ratchet_key')
        if not recipient_email or not ratchet_key:
            return
        print('ratchet_response', data)

        recipient_id = get_id_from_email(recipient_email)
        recipient_socket_id = get_user_socket_id(recipient_id)
        if recipient_socket_id:
            socketio.emit(
                'ratchet_response',
                {'from': sender_email, 'ratchet_key': ratchet_key},
                room=recipient_socket_id
            )

def get_user_socket_id(user_id):
    return user_sessions.get(str(user_id))

def is_user_online(user_id):
    return user_id in user_sessions