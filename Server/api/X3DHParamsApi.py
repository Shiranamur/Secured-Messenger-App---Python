from flask.views import MethodView
from flask_jwt_extended import jwt_required, get_jwt
from flask import request, jsonify
from Server.database import get_db_cnx, get_id_from_email
from . import api_bp


class X3DHParamsApi(MethodView):
    decorators = [jwt_required()]

    def post(self):
        # Get the current user's email (Alice)
        jwt_data = get_jwt()
        sender_email = jwt_data["email"]

        # Get the recipient email (Bob) and X3DH parameters
        data = request.json
        recipient_email = data.get('recipient_email')
        ephemeral_key = data.get('ephemeral_key')

        if not recipient_email or not ephemeral_key:
            return jsonify({"error": "Missing required parameters"}), 400

        # Store the X3DH parameters for Bob to retrieve
        cnx = get_db_cnx()
        cursor = cnx.cursor()
        try:
            # Store the X3DH parameters in a new table
            cursor.execute(
                """
                INSERT INTO x3dh_params (sender_email, recipient_email, ephemeral_key)
                VALUES (%s, %s, %s)
                """,
                (sender_email, recipient_email, ephemeral_key)
            )
            cnx.commit()

            # Notify Bob through socket
            from Server.socket_manager import socketio
            from Server.socket_events import user_sessions

            # Before socket emit
            recipient_id = get_id_from_email(recipient_email)
            print(f"Trying to notify recipient_id: {recipient_id}, in user_sessions: {recipient_id in user_sessions}")
            if recipient_id in user_sessions:
                recipient_sid = user_sessions[recipient_id]
                print(f"Emitting x3dh_params_ready to {recipient_email} (ID: {recipient_id}) with SID: {recipient_sid}")
                socketio.emit('x3dh_params_ready', {
                    'from': sender_email,
                    'notification': f'{sender_email} wants to establish secure communication'
                }, room=recipient_sid)  # Use the SID directly
            else:
                print(f"User {recipient_email} (ID: {recipient_id}) not online. Active sessions: {user_sessions}")

            return jsonify({"status": "success"}), 200
        except Exception as e:
            print(f"Error storing X3DH parameters: {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            if cursor: cursor.close()
            if cnx: cnx.close()

    def get(self, sender_email=None):
        if not sender_email:
            return jsonify({"error": "Sender email is required"}), 400

        # Get the current user's email (Bob)
        jwt_data = get_jwt()
        recipient_email = jwt_data["email"]

        # Fetch the X3DH parameters
        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT ephemeral_key FROM x3dh_params 
                WHERE sender_email = %s AND recipient_email = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (sender_email, recipient_email)
            )
            params = cursor.fetchone()

            if not params:
                return jsonify({"error": "No X3DH parameters found"}), 404

            return jsonify({
                "status": "success",
                "ephemeral_key": params["ephemeral_key"]
            }), 200
        except Exception as e:
            print(f"Error retrieving X3DH parameters: {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            if cursor: cursor.close()
            if cnx: cnx.close()

api_bp.add_url_rule(
    '/x3dh_params',
    view_func=X3DHParamsApi.as_view('x3dh_params'),
    methods=['POST']
)

api_bp.add_url_rule(
    '/x3dh_params/<sender_email>',
    view_func=X3DHParamsApi.as_view('x3dh_params_get'),
    methods=['GET']
)