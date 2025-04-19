import mysql.connector  # Use this instead of MySQLdb
from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from ..database import get_db_cnx

home_bp = Blueprint('home', __name__)

@home_bp.route('/dashboard')
@jwt_required()
def dashboard():
    """Main dashboard showing contacts and conversations."""
    user_id_str = get_jwt_identity()
    current_user_id = int(user_id_str)

    jwt_data = get_jwt()
    current_user_email = jwt_data['email']

    cnx = get_db_cnx()
    cursor = cnx.cursor()
    try:
        # fetch everyone else
        cursor.execute("SELECT id,email FROM users WHERE id != %s", (current_user_id,))
        users = cursor.fetchall()

        # fetch only your contacts
        cursor.execute("""
                SELECT user2.id, user2.email
                FROM contacts
                JOIN users AS user2 
                  ON contacts.user2_id = user2.id
                WHERE contacts.user1_id = %s
            """, (current_user_id,))
        contacts = cursor.fetchall()

    finally:
        cursor.close()
        cnx.close()

    return render_template(
        'dashboard.html',
        users=users,
        contacts=contacts,
        current_user_id=current_user_id,
        current_user_email=current_user_email
    )