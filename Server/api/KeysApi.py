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

    def post(self):
        # Get the current user's email from the JWT
        jwt_data = get_jwt()
        user_email = jwt_data["email"]

        # Get the contact's email from the request
        contact_email = request.json.get('contact_email')

        if not contact_email:
            return jsonify({"error": "Contact email is required"}), 400

        # Fetch the keys from the database
        cnx = get_db_cnx()
        cursor = cnx.cursor(dictionary=True)
        try:
            # First verify that these users are contacts
            cursor.execute(
                """
                SELECT * FROM contacts
                WHERE user1_id = (SELECT id FROM users WHERE email = %s)
                AND user2_id = (SELECT id FROM users WHERE email = %s)
                """,
                (user_email, contact_email)
            )
            contact_relationship = cursor.fetchone()

            if not contact_relationship:
                return jsonify({"error": "Not authorized - contact relationship not found"}), 403

            # Get the contact's identity key and signed prekey
            cursor.execute(
                "SELECT identity_public_key, signed_prekey, signed_prekey_signature FROM users WHERE email = %s",
                (contact_email,)
            )
            user_data = cursor.fetchone()

            if not user_data:
                return jsonify({"error": "User not found"}), 404

            # Get an unused one-time prekey if available
            cursor.execute(
                """
                SELECT prekey_id, prekey FROM prekeys
                WHERE user_id = (SELECT id FROM users WHERE email = %s)
                AND used = 0 LIMIT 1
                """,
                (contact_email,)
            )
            one_time_prekey = cursor.fetchone() or {"prekey_id": None, "prekey": None}

            # Mark the prekey as used if one was found
            if one_time_prekey and one_time_prekey.get("prekey_id"):
                cursor.execute(
                    "UPDATE prekeys SET used = 1 WHERE prekey_id = %s",
                    (one_time_prekey["prekey_id"],)
                )
                cnx.commit()

            # Construct the prekey bundle
            prekey_bundle = {
                "identity_public_key": user_data["identity_public_key"],
                "signed_prekey": user_data["signed_prekey"],
                "signed_prekey_signature": user_data["signed_prekey_signature"],
                "one_time_prekey": one_time_prekey
            }

            return jsonify(prekey_bundle), 200
        except Exception as e:
            print(f"Error retrieving keys: {e}")
            return jsonify({"error": "Failed to retrieve keys"}), 500
        finally:
            if cursor: cursor.close()
            if cnx: cnx.close()


api_bp.add_url_rule(
    '/keys',
    view_func=KeysApi.as_view('keys_get'),
    methods=['POST']
)