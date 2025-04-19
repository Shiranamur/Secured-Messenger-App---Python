import hashlib
import json
import os

from flask import Blueprint, render_template, redirect, url_for, flash, request

from database import get_db_cnx


auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    email = request.form['email']
    password = request.form['password']
    identity_public_key = request.form['identity_public_key']
    signed_prekey = request.form['signed_prekey']
    signed_prekey_signature = request.form['signed_prekey_signature']
    prekeys_json = request.form['prekeys']

    if not all([email, password, identity_public_key, signed_prekey, signed_prekey_signature, prekeys_json]):
        flash('All fields are required', 'error')
        return redirect(url_for('auth.register'))
    try:
        # parse the one-time prekeys
        prekeys = json.loads(prekeys_json)

        # generate password hash and salt
        salt = os.urandom(16)
        salt_hex = salt.hex()
        password_hash = hashlib.pbkdf2_hmac('sha512', password.encode(), salt, 300000)
        password_hash_hex = password_hash.hex()

        cnx = get_db_cnx()
        cursor = cnx.cursor()

        cursor.execute('SELECT * FROM users WHERE email = %s', (email,))
        user = cursor.fetchone()
        if user:
            flash('User already exists')
            return redirect(url_for('index'))

        cursor.execute("""
             INSERT INTO users (email, pwdhash, salt, identity_public_key, signed_prekey, signed_prekey_signature)
             VALUES (%s, %s, %s, %s, %s, %s)
         """, (email, password_hash_hex, salt_hex, identity_public_key, signed_prekey, signed_prekey_signature))

        user_id = cursor.lastrowid

        # Insert prekeys into the database
        for prekey_data in prekeys:
            cursor.execute("""
                INSERT INTO prekeys (user_id, prekey_id, prekey)
                VALUES (%s, %s, %s)
            """, (user_id, prekey_data['prekey_id'], prekey_data['prekey']))

        cnx.commit()
        flash('Register successful ! You can now login', 'success')

    except Exception as e:
        flash(f'An error occurred: {str(e)}', 'error')
        print(f"Error during registration: {e}")
        cnx.rollback()
    finally:
        cursor.close()
        cnx.close()

    return redirect(url_for('index'))

@auth_bp.route('/login', methods=['POST'])
def login():
    email = request.form['email']
    password = request.form['password']
    cnx = get_db_cnx()
    cursor = cnx.cursor()

    try:
        cursor.execute('SELECT * FROM users WHERE email = %s', (email,))
        user = cursor.fetchone()
        print(f"user email: {user[1]}, user id: {user[0]}")
        if user:
            stored_hash_hex = user[2]
            stored_salt_hex = user[3]
            salt = bytes.fromhex(stored_salt_hex)
            password_hash = hashlib.pbkdf2_hmac('sha512', password.encode(), salt, 300000)
            if password_hash.hex() == stored_hash_hex:
                flash('Login successful')
                return redirect(url_for('home.dashboard', current_user_id=user[0], current_user_email=user[1])) # Assuming user[0] is the user ID and user[1] is the email
            else:
                flash('Invalid Credentials or user not found')
        else:
            flash('Invalid Credentials or user not found')
    finally:
        cursor.close()
        cnx.close()