from flask import request, jsonify
from flask.views import MethodView
from flask_jwt_extended import jwt_required, get_jwt
from Server.database import get_db_cnx
from . import api_bp

# ─────────────────────────────────────────────
# 1.  /api/keys/<email>
# ─────────────────────────────────────────────
class KeysApi(MethodView):
    decorators = [jwt_required()]

    def get(self, email):
        cnx, cur = None, None
        try:
            cnx = get_db_cnx()
            cur = cnx.cursor(dictionary=True)

            # 1. identity + signed‑pre‑key
            cur.execute("""
                SELECT identity_public_key,
                       signed_prekey,
                       signed_prekey_signature
                  FROM users
                 WHERE email = %s
            """, (email,))
            row = cur.fetchone()
            if not row:
                return {"error": "user not found"}, 404

            # 2. ONE unused one‑time pre‑key
            cur.execute("""
                SELECT id, prekey
                  FROM prekeys
                 WHERE user_id = (SELECT id FROM users WHERE email=%s)
                   AND used = 0
                 LIMIT 1 FOR UPDATE
            """, (email,))
            pk = cur.fetchone()
            if pk:
                cur.execute("UPDATE prekeys SET used=1 WHERE id=%s", (pk["id"],))
                prekey_bundle = {"id": pk["id"], "prekey": pk["prekey"]}
            else:
                prekey_bundle = {"id": None, "prekey": None}

            cnx.commit()
            return {
                "identity_public_key"    : row["identity_public_key"],
                "signed_prekey"          : row["signed_prekey"],
                "signed_prekey_signature": row["signed_prekey_signature"],
                "one_time_prekey"        : prekey_bundle
            }

        except Exception as e:
            if cnx: cnx.rollback()
            print(e)
            return {"error": "internal"}, 500
        finally:
            if cur: cur.close()
            if cnx: cnx.close()


api_bp.add_url_rule(
    '/api/keys/<string:email>',
    view_func=KeysApi.as_view('keys_get'),
    methods=['GET']
)