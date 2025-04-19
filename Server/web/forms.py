import base64
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, TextAreaField, SubmitField
from wtforms.validators import DataRequired, Email, Length, ValidationError
import json

class RegistrationForm(FlaskForm):
    email       = StringField('Email', validators=[DataRequired(), Email()])
    password    = PasswordField('Password', validators=[DataRequired(), Length(min=8)])
    identity_public_key       = StringField('Identity Public Key', validators=[DataRequired()])
    signed_prekey             = StringField('Signed Prekey',       validators=[DataRequired()])
    signed_prekey_signature   = StringField('Prekey Signature',    validators=[DataRequired()])
    prekeys    = TextAreaField('One‑Time Prekeys (JSON)', validators=[DataRequired()])
    submit     = SubmitField('Register')

    def _validate_base64_length(self, data, length, field_name):
        try:
            raw = base64.b64decode(data)
        except Exception:
            raise ValidationError(f'{field_name} is not valid Base64')
        if len(raw) != length:
            raise ValidationError(f'{field_name} must be {length} bytes')

    def validate_identity_public_key(self, field):
        self._validate_base64_length(field.data, 32, 'Identity public key')

    def validate_signed_prekey(self, field):
        self._validate_base64_length(field.data, 32, 'Signed prekey')

    def validate_signed_prekey_signature(self, field):
        self._validate_base64_length(field.data, 64, 'Prekey signature')

    def validate_prekeys(self, field):
        try:
            arr = json.loads(field.data)
        except Exception:
            raise ValidationError('Prekeys must be valid JSON')
        if not isinstance(arr, list) or not arr:
            raise ValidationError('Prekeys must be a non‑empty list')
        for i, item in enumerate(arr):
            if 'prekey_id' not in item or 'prekey' not in item:
                raise ValidationError(f'Prekey #{i} missing id or key')
            self._validate_base64_length(item['prekey'], 32, f'Prekey #{i}')