# Python (Server/api/contact_view.py)
from flask_jwt_extended import jwt_required, get_jwt_identity

from Server.database import get_db_cnx, get_id_from_email
from flask import request, jsonify
from flask.views import MethodView
from . import api_bp
import mysql.connector


class ContactView(MethodView):

    @jwt_required()
    def post(self):
        # Code for adding a contact
        user1_id = get_jwt_identity()
        user2_email = request.form['user2']

        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        user2_id = get_id_from_email(user2_email)
        try:
            cursor.execute("SELECT * FROM users WHERE id = %s", (user2_id,))
            user_to_add = cursor.fetchone()
            if not user_to_add:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404

            cursor.execute("SELECT * FROM contacts WHERE user1_id = %s AND user2_id = %s", (user1_id, user2_id))
            if cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Contact already exists'}), 409

            cursor.execute("INSERT INTO contacts (user1_id, user2_id) VALUES (%s, %s), (%s, %s)",
                           (user1_id, user2_id, user2_id, user1_id))
            cnx.commit()

            cursor.execute("SELECT * FROM contacts WHERE user1_id = %s AND user2_id = %s", (user1_id, user2_id))
            if not cursor.fetchone():
                print('Failed to add contact')
                return jsonify({'status': 'error', 'message': 'Failed to add contact'}), 500

            return jsonify({
                'status': 'success',
                'message': 'Contact added successfully',
                'userEmail': user_to_add['email'],
            })
        except mysql.connector.Error as err:
            print('Failed to add contact ', err)
            return jsonify({'status': 'error', 'message': f"Error adding contact: {err}"}), 500
        finally:
            cursor.close()
            cnx.close()

    @jwt_required()
    def delete(self):
        # Code for removing a contact
        user1_id = get_jwt_identity()
        user2_email = request.form['emailToRemove']
        user2_id = get_id_from_email(user2_email)
        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        try:
            cursor.execute("SELECT * FROM users WHERE id = %s", (user2_id,))
            user_to_remove = cursor.fetchone()
            if not user_to_remove:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404

            cursor.execute("SELECT * FROM contacts WHERE user1_id = %s AND user2_id = %s", (user1_id, user2_id))
            if not cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Contact does not exists'}), 409

            cursor.execute("DELETE FROM contacts WHERE (user1_id = %s AND user2_id=%s)", (user1_id, user2_id))
            cursor.execute("DELETE FROM contacts WHERE (user1_id = %s AND user2_id=%s)", (user2_id, user1_id))
            cnx.commit()

            cursor.execute("SELECT * FROM contacts WHERE user1_id = %s AND user2_id = %s", (user1_id, user2_id))
            if cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Failed to remove contact'}), 500

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