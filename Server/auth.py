import hashlib
import os
from urllib import request

from flask import Blueprint, render_template, redirect, url_for, flash

from database import get_db_cnx

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        salt = os.urandom(16)
        passwordHash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)

        cnx = get_db_cnx()
        cursor = cnx.cursor()

        try:
            cursor.execute('SELECT * FROM users WHERE email = %s', (email,))
            user = cursor.fetchone()
            if user:
                flash('User already exists')
                return redirect(url_for('auth.login'))

            cursor.execute('INSERT INTO users (email, pwdhash, salt) VALUES (%s, %s, %s)'(email, passwordHash, salt))
            cnx.commit()
            flash('Register successful')
            return redirect(url_for('auth.login'))
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
                stored_salt = user[3]
                stored_hash = user[2]
                passwordHash = hashlib.pbkdf2_hmac('sha256', password.encode(), stored_salt, 100000)
                if passwordHash == stored_hash:
                    flash('Login successful')
                    return redirect(url_for('main.home'))
                else:
                    flash('Invalid Credentials or user not found')
            else:
                flash('Invalid Credentials or user not found')
        finally:
            cursor.close()
            cnx.close()

    return render_template('auth/login.html')