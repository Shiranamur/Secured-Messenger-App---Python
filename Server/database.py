import mysql.connector
from config.config import Config

def get_db_cnx():
    return mysql.connector.connect(**Config.DB_CONFIG)