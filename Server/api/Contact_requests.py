from flask.views import MethodView
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask import request, jsonify
from Server.database import get_db_cnx, get_email_from_id
from . import api_bp

class ContactRequestsView(MethodView):
    @jwt_required()
    def get(self):
        # Get pending contact requests for current user
        user_id = get_jwt_identity()
        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT cr.id, u.email as requester_email, cr.created_at
                FROM contact_requests cr
                JOIN users u ON cr.requester_id = u.id
                WHERE cr.recipient_id = %s AND cr.status = 'pending'
                """,
                (user_id,)
            )
            requests = cursor.fetchall()
            return jsonify({'requests': requests})
        finally:
            cursor.close()
            cnx.close()

    @jwt_required()
    def put(self, request_id):
        # Accept or reject contact request
        user_id = get_jwt_identity()
        action = request.json.get('action')


        if action not in ['accept', 'reject']:
            return jsonify({'status': 'error', 'message': 'Invalid action'}), 400

        status_mapping = {'accept': 'accepted', 'reject': 'rejected'}
        status = status_mapping[action]

        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        try:
            # Verify this request is for current user
            cursor.execute(
                "SELECT * FROM contact_requests WHERE id = %s AND recipient_id = %s",
                (request_id, user_id)
            )
            req = cursor.fetchone()
            if not req:
                return jsonify({'status': 'error', 'message': 'Request not found'}), 404

            cursor.execute(
                "UPDATE contact_requests SET status = %s WHERE id = %s",
                (status, request_id)
            )
            cnx.commit()

            # Notify requester
            from Server.socket_manager import socketio
            from Server.socket_events import get_user_socket_id

            print('acton taken is ', action)
            print('status is ', status)
            requester_sid = get_user_socket_id(req['requester_id'])
            if requester_sid:
                recipient_email = get_email_from_id(user_id)
                socketio.emit('contact_request_response', {
                    'from': recipient_email,
                    'status': status
                }, room=requester_sid)

            return jsonify({'status': 'success', 'message': f'Request {status}'})
        finally:
            cursor.close()
            cnx.close()

api_bp.add_url_rule('/contact-requests', view_func=ContactRequestsView.as_view('contact_requests'), methods=['GET'])
api_bp.add_url_rule('/contact-requests/<int:request_id>', view_func=ContactRequestsView.as_view('contact_request_action'), methods=['PUT'])