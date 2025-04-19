from flask_jwt_extended import verify_jwt_in_request, get_jwt
from flask_socketio import join_room, emit
from Server.database import get_db_cnx

def register_handlers(socketio):
    @socketio.on('connect')
    def handle_connect():
        verify_jwt_in_request()
        jwt_data = get_jwt()
        user_email = jwt_data["email"]
        join_room(user_email)
        print(f"User {user_email} connected")

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

    @socketio.on('get_contacts')
    def handle_get_contacts():
        verify_jwt_in_request()
        jwt_data = get_jwt()
        user_email = jwt_data["email"]

        cnx, cur = None, None
        try:
            cnx = get_db_cnx()
            cur = cnx.cursor(dictionary=True)
            cur.execute("""
                SELECT c.user2_id as id, u.email
                FROM contacts c
                JOIN users u ON c.user2_id = u.id
                WHERE c.user1_id = (SELECT id FROM users WHERE email = %s)
            """, (user_email,))
            contacts_data = cur.fetchall()
            emit('contacts_list', {"contacts": contacts_data})
        except Exception as e:
            emit('error', {"error": f"Failed to retrieve contacts: {str(e)}"})
        finally:
            if cur: cur.close()
            if cnx: cnx.close()