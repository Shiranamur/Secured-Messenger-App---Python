# Server/api/routes.py
from . import api_bp
# Import all API modules
from .contact_view import ContactView
from . import conversations ##, users

# Register the ContactView with the API blueprint
contact_view = ContactView.as_view('contact')
api_bp.add_url_rule('/contact', view_func=contact_view, methods=['POST', 'DELETE'])