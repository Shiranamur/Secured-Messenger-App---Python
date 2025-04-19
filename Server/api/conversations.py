# Server/api/conversations.py
from Server.database import get_db_cnx
from flask import jsonify, request
from . import api_bp

## filer for the moment
@api_bp.route('/conversations/<int:contact_id>')
def get_conversations(contact_id):
    cnx = get_db_cnx()
    cursor = cnx.cursor()
    messages = []

    try:
        cursor.execute("""
            SELECT id, sender_id, receiver_id, content, timestamp
            FROM messages
            WHERE (sender_id = %s OR receiver_id = %s)
            ORDER BY timestamp ASC
        """, (contact_id, contact_id))

        columns = [col[0] for col in cursor.description]
        messages = [dict(zip(columns, row)) for row in cursor.fetchall()]

        # Convert datetime objects to strings
        for msg in messages:
            if 'timestamp' in msg and msg['timestamp']:
                msg['timestamp'] = msg['timestamp'].isoformat()
    finally:
        cursor.close()
        cnx.close()

    return jsonify(messages)