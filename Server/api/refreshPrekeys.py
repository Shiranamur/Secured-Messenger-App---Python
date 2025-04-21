# prekeys.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from Server.database import get_db_cnx
import json

prekeys_bp = Blueprint('prekeys', __name__)

@prekeys_bp.route('/api/refreshpks', methods=['POST'])
@jwt_required()
def refresh_prekeys():
    user_id = get_jwt_identity()
    data    = request.get_json()

    if 'prekeys' not in data or not isinstance(data['prekeys'], list):
        return jsonify({'status': 'error', 'message': 'invalid payload'}), 400

    cnx    = get_db_cnx()
    cursor = cnx.cursor()
    try:
        for pk in data['prekeys']:
            cursor.execute(
                "SELECT id FROM prekeys "
                "WHERE user_id = %s AND used = 1 "
                "ORDER BY id LIMIT 1",
                (user_id,)
            )
            row = cursor.fetchone()

            if row:
                slot_id = row[0]
                cursor.execute(
                    "UPDATE prekeys "
                    "   SET prekey_id = %s, prekey = %s, used = 0 "
                    " WHERE id = %s",
                    (pk['prekey_id'], pk['prekey'], slot_id)
                )
            else:
                cursor.execute(
                    "INSERT INTO prekeys (user_id, prekey_id, prekey) "
                    "VALUES (%s, %s, %s)",
                    (user_id, pk['prekey_id'], pk['prekey'])
                )

        cnx.commit()
    finally:
        cursor.close()
        cnx.close()

    return jsonify({'status': 'success', 'message': 'prekeys refreshed'}), 201


@prekeys_bp.route('/api/prekeys/count', methods=['GET'])
@jwt_required()
def get_prekeys_count():
    user_id = get_jwt_identity()
    cnx     = get_db_cnx()
    cursor  = cnx.cursor()
    try:
        cursor.execute(
            "SELECT COUNT(*) "
            "  FROM prekeys "
            " WHERE user_id = %s AND used = 0",
            (user_id,)
        )
        (count,) = cursor.fetchone()
    finally:
        cursor.close()
        cnx.close()

    return jsonify({ 'count': count }), 200
