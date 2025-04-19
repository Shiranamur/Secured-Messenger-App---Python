class Config:

    SECRET_KEY = 'dev_secret_key'
    PASSWORD_PEPPER = 'VIVE-VIVE-VIVE-LES-GROS-XXXX'
    JWT_SECRET_KEY = 'a‑very‑strong‑secret‑here'
    JWT_TOKEN_LOCATION = ['cookies']
    JWT_COOKIE_SECURE   = False         # set to true for HTTPS only
    JWT_COOKIE_HTTPONLY = True
    JWT_COOKIE_SAMESITE = 'Lax'
    JWT_ACCESS_CSRF_PROTECT = True     # double‑submit CSRF for cookie auth
    DB_CONFIG = {
        'host': 'localhost',
        'port': 3306,
        'username': 'root',
        'password': 'root',
        'database': 'userdb',
    }
