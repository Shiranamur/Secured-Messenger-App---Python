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