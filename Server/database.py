import mysql.connector
from config.config import DB_CONFIG

def get_db_cnx():
    return mysql.connector.connect(**DB_CONFIG)