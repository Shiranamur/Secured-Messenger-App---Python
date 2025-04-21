# Python (Server/api/contact_view.py)
from flask_jwt_extended import jwt_required, get_jwt_identity

from Server.database import get_db_cnx, get_email_from_id
from flask import request, jsonify
from flask.views import MethodView
from . import api_bp
import mysql.connector


class ContactView(MethodView):

    @jwt_required()
    def post(self):
        user1_id = get_jwt_identity()
        user2_email = request.form['user2']

        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        try:
            cursor.execute("SELECT * FROM users WHERE email = %s", (user2_email,))
            user_to_add = cursor.fetchone()
            if not user_to_add:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404
            elif str(user_to_add['id']) == user1_id:
                return jsonify({'status': 'error', 'message': 'Cannot add yourself'}), 409

            # Create contact request instead of immediately adding
            cursor.execute(
                """
                INSERT INTO contact_requests (requester_id, recipient_id)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE 
                    status = 'pending',
                    created_at = CURRENT_TIMESTAMP
                """,
                (user1_id, user_to_add['id'])
            )
            cnx.commit()

            # Notify recipient through socket
            from Server.socket_manager import socketio
            from Server.socket_events import user_sessions, get_user_socket_id

            recipient_socket_id = get_user_socket_id(user_to_add['id'])
            if recipient_socket_id:
                sender_email = get_email_from_id(user1_id)
                socketio.emit('contact_request', {
                    'from': sender_email
                }, room=recipient_socket_id)

            return jsonify({
                'status': 'success',
                'message': 'Contact request sent successfully',
                'userEmail': user_to_add['email'],
            })
        except Exception as e:
            print('Failed to send contact request', e)
            return jsonify({'status': 'error', 'message': str(e)}), 500
        finally:
            cursor.close()
            cnx.close()

    @jwt_required()
    def delete(self):
        user1_id = get_jwt_identity()
        user2_email = request.form['emailToRemove']
        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)

        try:
            cursor.execute("SELECT * FROM users WHERE email = %s", (user2_email,))
            user_to_remove = cursor.fetchone()
            if not user_to_remove:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404

            # Mark contact as deleted. Here, we add a new entry with the status deleted 'deleted'.
            # Insert with duplicate handling: update status to 'deleted' if the entry exists
            cursor.execute(
                """
                INSERT INTO contact_requests (requester_id, recipient_id, status)
                VALUES (%s, %s, 'deleted')
                ON DUPLICATE KEY UPDATE status = 'deleted'
                """,
                (user1_id, user_to_remove['id'])
            )
            cnx.commit()

            # Notify the other user via socket
            from Server.socket_manager import socketio
            from Server.socket_events import get_user_socket_id

            recipient_socket_id = get_user_socket_id(user_to_remove['id'])
            if recipient_socket_id:
                sender_email = get_email_from_id(user1_id)
                socketio.emit('contact_removed', {
                    'from': sender_email
                }, room=recipient_socket_id)

            return jsonify({
                'status': 'success',
                'message': 'Contact removed successfully',
                'userEmail': user_to_remove['email'],
            })

        except mysql.connector.Error as err:
            return jsonify({'status': 'error', 'message': f"Error removing contact: {err}"}), 500
        finally:
            cursor.close()
            cnx.close()

contact_view = ContactView.as_view('contact')
api_bp.add_url_rule('/contact', view_func=contact_view, methods=['POST', 'DELETE'])