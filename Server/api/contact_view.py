# Python (Server/api/contact_view.py)
from flask import request, jsonify
from flask.views import MethodView
from ..database import get_db_cnx
import mysql.connector

class ContactView(MethodView):
    def post(self):
        # Code for adding a contact
        user1 = request.form['user1']
        user2 = request.form['user2']
        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        try:
            cursor.execute("SELECT * FROM users WHERE id = %s", (user2,))
            user_to_add = cursor.fetchone()
            if not user_to_add:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404

            cursor.execute("SELECT * FROM contacts WHERE user1_id = %s AND user2_id = %s", (user1, user2))
            if cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Contact already exists'}), 409

            cursor.execute("INSERT INTO contacts (user1_id, user2_id) VALUES (%s, %s)", (user1, user2))
            cnx.commit()

            cursor.execute("SELECT * FROM contacts WHERE user1_id = %s AND user2_id = %s", (user1, user2))
            if not cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Failed to add contact'}), 500

            return jsonify({
                'status': 'success',
                'message': 'Contact added successfully',
                'contact': {
                    'user1_id': user1,
                    'user2': user_to_add
                }
            })
        except mysql.connector.Error as err:
            return jsonify({'status': 'error', 'message': f"Error adding contact: {err}"}), 500
        finally:
            cursor.close()
            cnx.close()

    def delete(self):
        # Code for removing a contact
        user1 = request.form['user1']
        user2 = request.form['user2']
        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        try:
            cursor.execute("SELECT * FROM users WHERE id = %s", (user2,))
            user_to_remove = cursor.fetchone()
            if not user_to_remove:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404

            cursor.execute("SELECT * FROM contacts WHERE user1_id = %s AND user2_id = %s", (user1, user2))
            if not cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Contact does not exists'}), 409

            cursor.execute("DELETE FROM contacts WHERE (user1_id = %s AND user2_id=%s)", (user1, user2))
            cnx.commit()

            cursor.execute("SELECT * FROM contacts WHERE user1_id = %s AND user2_id = %s", (user1, user2))
            if cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Failed to remove contact'}), 500

            return jsonify({
                'status': 'success',
                'message': 'Contact removed successfully',
                'contact': {
                    'user1_id': user1,
                    'user2': user_to_remove
                }
            })
        except mysql.connector.Error as err:
            return jsonify({'status': 'error', 'message': f"Error removing contact: {err}"}), 500
        finally:
            cursor.close()
            cnx.close()