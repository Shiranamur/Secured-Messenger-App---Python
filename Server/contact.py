from urllib import request
import mysql.connector  # Use this instead of MySQLdb
from flask import Blueprint, render_template, request, redirect, url_for, flash
from database import get_db_cnx
import os
import hashlib

contact_bp = Blueprint('contact', __name__)


@contact_bp.route('/contact')
def contact():
    cnx = get_db_cnx()
    cursor = cnx.cursor()
    try:
        cursor.execute("SELECT id,email from users")
        users = cursor.fetchall()
        cursor.execute(
            """SELECT user1.id, user1.email , user2.id, user2.email
            FROM contacts 
            INNER JOIN users AS user1 ON contacts.user1_id = user1.id
            INNER JOIN users AS user2 ON contacts.user2_id = user2.id;"""
        )
        conversions = cursor.fetchall()

        for conversion in conversions:
            print("txt")
    except mysql.connector.Error :
        pass
    finally:
        cursor.close()
        cnx.close()
    return render_template('contact.html', Users = users, Conversions = conversions)

@contact_bp.route('/add_contact', methods=['GET', 'POST'])
def add_contact():
    if request.method == 'POST':
        user1 = request.form['user1']
        user2 = request.form['user2']
        cnx = get_db_cnx()
        cursor = cnx.cursor()
        try:
            cursor.execute("INSERT INTO contacts (user1_id,user2_id) VALUES (%s, %s)",(user1,user2))
            cnx.commit()
            flash('Le contact a bien été ajouté')
            return redirect(url_for('contact.contact'))
        except mysql.connector.Error:
            flash("Une erreur lors de l'ajout du contact")
            return redirect(url_for('contact.contact'))
        finally:
            cursor.close()
            cnx.close()
