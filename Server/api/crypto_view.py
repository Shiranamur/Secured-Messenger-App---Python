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

# ─────────────────────────────────────────────
# 2.  /messages  POST / GET
# ─────────────────────────────────────────────
class MessagesApi(MethodView):
    decorators = [jwt_required()]

    # ---------- POST ----------
    def post(self):
        data = request.get_json(force=True)
        print("FDP ELLE EST OU MA DATA ")
        required = {"receiver", "ciphertext"}   # msg_type is optional for now
        if not required.issubset(data):
            return {"error": "missing fields"}, 400

        jwt_data       = get_jwt()
        sender_email   = jwt_data["email"]
        receiver_email = data["receiver"]
        blob           = data["ciphertext"]
        msg_type       = data.get("msg_type", "message")   # placeholder

        cnx, cur = None, None
        try:
            cnx = get_db_cnx()
            cur = cnx.cursor()
            cur.execute(
                "INSERT INTO messages (sender_email, receiver_email, content)"
                " VALUES (%s, %s, %s)",
                (sender_email, receiver_email, blob)
            )
            cnx.commit()

            # push to Socket.IO if receiver online
            try:
                from Server.socketio import push_message
                push_message(receiver_email, {
                    "from"       : sender_email,
                    "ciphertext" : blob,
                    "msg_type"   : msg_type,
                    "id"         : cur.lastrowid
                })
            except ImportError:
                pass   # socketio not initialised in unit tests

            return {"status": "queued"}, 202

        except Exception as e:
            if cnx: cnx.rollback()
            print(e)
            return {"error": "internal"}, 500
        finally:
            if cur: cur.close()
            if cnx: cnx.close()

    # ---------- GET ----------
    def get(self, contact_email):
        """
        /api/messages/<contact_email>?after=<ISO8601 ts>
        Returns all messages between *current user* and contact_email.
        """
        me        = get_jwt()['email']
        after_ts  = request.args.get('after')

        cnx, cur = None, None
        try:
            cnx = get_db_cnx()
            cur = cnx.cursor(dictionary=True)

            where = """
              ((sender_email   = %s AND receiver_email = %s) OR
               (sender_email   = %s AND receiver_email = %s))
            """
            params = [me, contact_email, contact_email, me]
            if after_ts:
                where += " AND timestamp > %s"
                params.append(after_ts)

            cur.execute(f"""
                SELECT id,
                       sender_email,
                       receiver_email,
                       content        AS ciphertext,
                       timestamp      AS ts,
                       is_delivered,
                       is_read
                  FROM messages
                 WHERE {where}
                 ORDER BY ts
            """, params)

            rows = cur.fetchall()
            for r in rows:
                r['ts'] = r['ts'].isoformat()

            return rows

        finally:
            if cur: cur.close()
            if cnx: cnx.close()


api_bp.add_url_rule(
    '/messages',
    view_func=MessagesApi.as_view('messages_post'),
    methods=['POST']
)
api_bp.add_url_rule(
    '/messages/<string:contact_email>',
    view_func=MessagesApi.as_view('messages_get'),
    methods=['GET']
)
