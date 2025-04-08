import mysql.connector  # Use this instead of MySQLdb
from flask import Blueprint, render_template, request, redirect, url_for, flash
from database import get_db_cnx

home_bp = Blueprint('home', __name__)

@home_bp.route('/dashboard')
def dashboard():
    """Main dashboard showing contacts and conversations."""
    cnx = get_db_cnx()
    cursor = cnx.cursor()
    current_user_id = request.args.get('current_user_id')
    current_user_email = request.args.get('current_user_email')
    users = []
    contacts = []

    try:
        cursor.execute("SELECT id,email from users WHERE id != %s", (current_user_id,))
        users = cursor.fetchall()
        cursor.execute("""
            SELECT user1.id, user1.email, user2.id, user2.email
            FROM contacts
            INNER JOIN users AS user1 ON contacts.user1_id = user1.id
            INNER JOIN users AS user2 ON contacts.user2_id = user2.id;
            """)
        contacts = cursor.fetchall()
        for contact in contacts:
            print("Contact:", contact[2:])
    except mysql.connector.Error as err:
        flash(f"Database Error: {err}")
        print("Database Error:", err)
    finally:
        cursor.close()
        cnx.close()

    return render_template('dashboard.html', users=users, contacts=[contact[2:] for contact in contacts], current_user_id=current_user_id, current_user_email=current_user_email)