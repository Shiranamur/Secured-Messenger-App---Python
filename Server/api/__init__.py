
from flask import Blueprint

# Create the API blueprint with URL prefix
api_bp = Blueprint('api', __name__, url_prefix='/api')

# Import endpoint modules so their decorators run and register routes
from . import Contacts, KeysApi, X3DHParamsApi, Contact_requests, refreshPrekeys