import mysql.connector
from config import DATABASE_CONFIG

def get_db_cnx():
    return mysql.connector.connect(**DATABASE_CONFIG)