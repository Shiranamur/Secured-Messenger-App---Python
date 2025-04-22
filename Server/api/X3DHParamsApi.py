from flask.views import MethodView
from flask_jwt_extended import jwt_required, get_jwt
from flask import request, jsonify
from Server.database import get_db_cnx, get_id_from_email
from . import api_bp
from Server.socket_manager import socketio
from Server.socket_events import get_user_socket_id


# Ephemeral key endpoints
class EphemeralKeyApi(MethodView):
    @jwt_required()
    def post(self):
        """Send ephemeral key to a recipient"""
        jwt_data = get_jwt()
        sender_email = jwt_data["email"]
        data = request.json
        recipient_email = data.get('recipient_email')
        ephemeral_key = data.get('ephemeral_key')
        prekey_id = data.get('prekey_id')

        if not recipient_email or not ephemeral_key:
            return jsonify({"error": "Missing required parameters"}), 400

        cnx = get_db_cnx()
        cursor = cnx.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO x3dh_params (sender_email, recipient_email, ephemeral_key, prekey_id)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    sender_email = %s,
                    recipient_email = %s,
                    ephemeral_key = %s,
                    prekey_id = %s
                """,
                (sender_email, recipient_email, ephemeral_key, prekey_id, sender_email, recipient_email, ephemeral_key, prekey_id)
            )
            cnx.commit()

            # Notify recipient through socket
            recipient_id = get_id_from_email(recipient_email)
            recipient_socket_id = get_user_socket_id(recipient_id)
            if recipient_socket_id:
                socketio.emit('ephemeral_key', {
                    'from': sender_email,
                    'ephemeral_key': ephemeral_key
                }, room=recipient_socket_id)
            print(f"Ephemeral key sent to {recipient_email} from {sender_email}")
            return jsonify({"status": "success"}), 200
        except Exception as e:
            print(f"Error storing ephemeral key: {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            if cursor: cursor.close()
            if cnx: cnx.close()

class RetrieveEphemeralKeyApi(MethodView):
    @jwt_required()
    def post(self):
        """Retrieve ephemeral key sent by initiator"""
        data = request.json
        sender_email = data.get('sender_email')

        if not sender_email:
            return jsonify({"error": "Missing sender email"}), 400

        jwt_data = get_jwt()
        recipient_email = jwt_data["email"]

        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT ephemeral_key, prekey_id FROM x3dh_params
                WHERE sender_email = %s AND recipient_email = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (sender_email, recipient_email)
            )
            params = cursor.fetchone()
            if not params:
                return jsonify({"error": "No ephemeral key found"}), 404

            return jsonify({
                "status": "success",
                "ephemeral_key": params["ephemeral_key"],
                "prekey_id": params["prekey_id"]
            }), 200
        except Exception as e:
            print(f"Error retrieving ephemeral key: {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            if cursor: cursor.close()
            if cnx: cnx.close()

# Identity key endpoint
class IdentityKeyApi(MethodView):
    @jwt_required()
    def post(self):
        """Retrieve identity key of another user"""
        data = request.json
        email = data.get('email')

        if not email:
            return jsonify({"error": "Missing email"}), 400

        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        try:
            cursor.execute(
                "SELECT identity_public_key AS identity_key FROM users WHERE email = %s",
                (email,)
            )
            result = cursor.fetchone()
            if not result:
                return jsonify({"error": "User not found"}), 404

            return jsonify({"identity_key": result['identity_key']}), 200
        except Exception as e:
            print(f"Error retrieving identity key: {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            if cursor: cursor.close()
            if cnx: cnx.close()



# Register routes
api_bp.add_url_rule('/x3dh_params/ephemeral/send', view_func=EphemeralKeyApi.as_view('send_ephemeral_key'), methods=['POST'])
api_bp.add_url_rule('/x3dh_params/ephemeral/retrieve', view_func=RetrieveEphemeralKeyApi.as_view('retrieve_ephemeral_key'), methods=['POST'])
api_bp.add_url_rule('/identity_key', view_func=IdentityKeyApi.as_view('identity_key'), methods=['POST'])
