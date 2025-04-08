import hashlib
import os

from flask import Blueprint, render_template, redirect, url_for, flash, request

from database import get_db_cnx


auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        identity_public_key = request.form['identity_public_key']
        salt = os.urandom(16)
        salt_hex = salt.hex()
        password_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
        password_hash_hex = password_hash.hex()

        cnx = get_db_cnx()
        cursor = cnx.cursor()

        try:
            cursor.execute('SELECT * FROM users WHERE email = %s', (email,))
            user = cursor.fetchone()
            if user:
                flash('User already exists')
                return redirect(url_for('index'))

            cursor.execute(
                'INSERT INTO users (email, pwdhash, salt, identity_public_key) VALUES (%s, %s, %s, %s)',
                (email, password_hash_hex, salt_hex, identity_public_key)
            )
            cnx.commit()
            flash('Register successful')
            return redirect(url_for('index'))
        finally:
            cursor.close()
            cnx.close()

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        cnx = get_db_cnx()
        cursor = cnx.cursor()

        try:
            cursor.execute('SELECT * FROM users WHERE email = %s', (email,))
            user = cursor.fetchone()
            if user:
                stored_hash_hex = user[2]
                stored_salt_hex = user[3]
                salt = bytes.fromhex(stored_salt_hex)
                password_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
                if password_hash.hex() == stored_hash_hex:
                    flash('Login successful')
                    return redirect(url_for('index')) #change to /home quand la page est faite
                else:
                    flash('Invalid Credentials or user not found')
            else:
                flash('Invalid Credentials or user not found')
        finally:
            cursor.close()
            cnx.close()

    return render_template('auth/login.html')