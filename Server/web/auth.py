import os
import json
import hashlib

from datetime import timedelta
from flask import (
    Blueprint, render_template, redirect, url_for,
    flash, request, current_app
)
from .forms import RegistrationForm
from datetime import timedelta
from flask_jwt_extended import create_access_token, set_access_cookies


from ..database import get_db_cnx


auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    form = RegistrationForm()
    # Validate CSRF + fields
    if not form.validate_on_submit():
        # flash each field error
        for field, errs in form.errors.items():
            label = getattr(form, field).label.text
            for e in errs:
                flash(f"{label}: {e}", 'error')
        return redirect(url_for('index'))

    # pull in data
    email                   = form.email.data.lower()
    password                = form.password.data
    identity_public_key     = form.identity_public_key.data
    signed_prekey           = form.signed_prekey.data
    signed_prekey_signature = form.signed_prekey_signature.data
    prekeys_json            = form.prekeys.data

    # pepper + salt + hash
    pepper = current_app.config.get('PASSWORD_PEPPER', '').encode()
    salt   = os.urandom(16)
    pwd    = password.encode() + pepper
    hash_bytes = hashlib.pbkdf2_hmac('sha512', pwd, salt, 300_000)
    pwdhash_hex = hash_bytes.hex()
    salt_hex    = salt.hex()

    # store in DB
    cnx    = get_db_cnx()
    cursor = cnx.cursor()
    try:
        # no duplicate email
        cursor.execute("SELECT 1 FROM users WHERE email=%s", (email,))
        if cursor.fetchone():
            flash('Email already registered', 'error')
            return redirect(url_for('index'))

        cursor.execute("""
            INSERT INTO users
             (email, pwdhash, salt, identity_public_key, signed_prekey, signed_prekey_signature)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            email, pwdhash_hex, salt_hex,
            identity_public_key, signed_prekey, signed_prekey_signature
        ))
        user_id = cursor.lastrowid

        prekeys = json.loads(prekeys_json)
        for pk in prekeys:
            cursor.execute("""
                INSERT INTO prekeys (user_id, prekey_id, prekey)
                VALUES (%s, %s, %s)
            """, (user_id, pk['prekey_id'], pk['prekey']))

        cnx.commit()
        flash('Registration successful! You can now log in.', 'success')

    except Exception:
        current_app.logger.exception("Error during registration")
        cnx.rollback()
        flash('Internal error. Please try again.', 'error')
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
    user = None

    try:
        cursor.execute('SELECT id, email, pwdhash, salt FROM users WHERE email = %s', (email,))
        row = cursor.fetchone()
        if row:
            user_id, user_email, stored_hash, stored_salt = row
            salt = bytes.fromhex(stored_salt)
            candidate = hashlib.pbkdf2_hmac(
                'sha512', password.encode(), salt, 300000
            ).hex()

            if candidate == stored_hash:
                access_token = create_access_token(
                    identity={'id': user_id, 'email': user_email},
                    expires_delta=timedelta(hours=1)
                )
                resp = redirect(url_for('home.dashboard'))
                set_access_cookies(resp, access_token)
                return resp

        flash('Invalid credentials', 'error')
        return redirect(url_for('index'))

    except Exception as e:
        #app.logger.exception("Login error")
        flash('Internal error. Please try again.', 'error')
        return redirect(url_for('index'))

    finally:
        cursor.close()
        cnx.close()