import mysql.connector  # Use this instead of MySQLdb
from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..database import get_db_cnx

home_bp = Blueprint('home', __name__)

@home_bp.route('/dashboard')
@jwt_required()
def dashboard():
    """Main dashboard showing contacts and conversations."""
    me = get_jwt_identity()  # {'id':…, 'email':…}

    cnx = get_db_cnx()
    cursor = cnx.cursor()
    try:
        # fetch everyone else
        cursor.execute("SELECT id,email FROM users WHERE id != %s", (me['id'],))
        users = cursor.fetchall()

        # fetch only your contacts
        cursor.execute("""
                SELECT user2.id, user2.email
                FROM contacts
                JOIN users AS user2 
                  ON contacts.user2_id = user2.id
                WHERE contacts.user1_id = %s
            """, (me['id'],))
        contacts = cursor.fetchall()

    finally:
        cursor.close()
        cnx.close()

    return render_template(
        'dashboard.html',
        users=users,
        contacts=contacts,
        current_user_id=me['id'],
        current_user_email=me['email']
    )