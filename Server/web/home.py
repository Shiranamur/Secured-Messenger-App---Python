from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

home_bp = Blueprint('home', __name__)

@home_bp.route('/dashboard')
@jwt_required()
def dashboard():
    return render_template('dashboard.html')