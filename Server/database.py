import mysql.connector
import os
from urllib.parse import urlparse


def get_db_cnx():
    """Get a MySQL database connection using either a connection string or config dict."""
    try:
        # Try using connection string if provided in environment
        conn_string = os.getenv('DB_CONNECTION_STRING')
        if conn_string:
            # Parse connection string to keyword arguments
            result = urlparse(conn_string)
            username = result.username
            password = result.password
            database = result.path.strip('/')
            hostname = result.hostname
            port = result.port or 3306

            return mysql.connector.connect(
                host=hostname,
                user=username,
                password=password,
                database=database,
                port=port
            )
        else:
            raise Exception('No database connection string')
    except mysql.connector.Error as err:
        print(f"Database connection error: {err}")
        raise

def get_id_from_email(email):
    """Get user ID from email."""
    cnx = get_db_cnx()
    cursor = cnx.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        result = cursor.fetchone()
        return result[0] if result else None
    finally:
        cursor.close()
        cnx.close()

def get_email_from_id(user_id):
    """Get user email from ID."""
    cnx = get_db_cnx()
    cursor = cnx.cursor()
    try:
        cursor.execute("SELECT email FROM users WHERE id = %s", (user_id,))
        result = cursor.fetchone()
        return result[0] if result else None
    finally:
        cursor.close()
        cnx.close()

def messaging_waiting(user_email, contact_email):
    try:
        cnx = get_db_cnx()
        cur = cnx.cursor(dictionary=True)

        # Requête pour récupérer les messages non livrés pour ce contact
        cur.execute("""
            SELECT content, timestamp
            FROM messages
            WHERE sender_email = %s AND receiver_email = %s AND is_delivered = FALSE
        """, (contact_email, user_email))

        messages = cur.fetchall()

        cur. execute(
            """UPDATE messages
                SET is_delivered = TRUE
                WHERE sender_email = %s AND receiver_email = %s AND is_delivered = FALSE;
                )"""
        , (contact_email, user_email))
        for message in messages:
            message['timestamp'] = message['timestamp'].isoformat()

        return messages

    except Exception as e:
        print(f"Error fetching undelivered messages: {e}")
        return None
    finally:
        if cur:
            cur.close()
        if cnx:
            cnx.close()

def mark_messages_as_read_in_db(user_email, contact_email):
    """Met à jour le statut 'is_read' des messages reçus."""
    cnx = get_db_cnx()
    cursor = cnx.cursor()
    try:
        cursor.execute(
            """UPDATE messages
               SET is_read = TRUE
               WHERE sender_email = %s AND receiver_email = %s""",
            (contact_email, user_email)
        )
        cnx.commit()
    finally:
        cursor.close()
        cnx.close()
