import { isValidEmail, validateBase64Length, showValidationError } from './InputValidation.js'
import {createKeys} from "./X3DH.js";


document.addEventListener('DOMContentLoaded', function() {
    // Get references to elements
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    // Add click event listeners if elements exist
    if (loginBtn && registerBtn && loginForm && registerForm) {
        loginBtn.addEventListener('click', function() {
            loginForm.classList.add('active-form');
            registerForm.classList.remove('active-form');
            this.classList.add('active');
            registerBtn.classList.remove('active');
        });

        registerBtn.addEventListener('click', function() {
            registerForm.classList.add('active-form');
            loginForm.classList.remove('active-form');
            this.classList.add('active');
            loginBtn.classList.remove('active');
        });
    } else {
        console.error('One or more elements not found for form toggle');
    }

    // Add validation to registration form
    if (registerForm) {
        registerForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            // Call createKeys and properly destructure the result
            await createKeys();

            // Get values from form and hidden fields
            const emailInput = this.querySelector('input[name="email"]');
            const passwordInput = this.querySelector('input[name="password"]');
            const identityPublicKey = document.getElementById('identity-public-key').value;
            const signedPrekey = document.getElementById('signed-prekey').value;
            const signedPrekeySignature = document.getElementById('signed-prekey-signature').value;
            const prekeys = document.getElementById('prekeys').value;

            // Clear previous error messages
            const flashMessages = document.querySelector('.flash-messages');
            if (flashMessages) {
                flashMessages.innerHTML = '';
            }

            // Validate email
            if (!isValidEmail(emailInput.value)) {
                showValidationError('Email: Invalid email address.');
                return;
            }

            // Validate password
            if (passwordInput.value.length < 8) {
                showValidationError('Password: Field must be at least 8 characters long.');
                return;
            }

            // Validate key lengths
            if (!validateBase64Length(identityPublicKey, 32, 'Identity public key')) {
                return;
            }

            if (!validateBase64Length(signedPrekey, 32, 'Signed prekey')) {
                return;
            }

            if (!validateBase64Length(signedPrekeySignature, 64, 'Prekey signature')) {
                return;
            }

            // Validate prekeys
            try {
                const prekeyArray = JSON.parse(prekeys);
                if (!Array.isArray(prekeyArray) || prekeyArray.length === 0) {
                    showValidationError('Prekeys must be a non-empty list');
                    return;
                }

                for (let i = 0; i < prekeyArray.length; i++) {
                    const item = prekeyArray[i];
                    if (!item.prekey_id && item.prekey_id !== 0 || !item.prekey) {
                        showValidationError(`Prekey #${i} missing id or key`);
                        return;
                    }
                    if (!validateBase64Length(item.prekey, 32, `Prekey #${i}`)) {
                        return;
                    }
                }
            } catch (e) {
                showValidationError('Prekeys must be valid JSON');
                return;
            }

            // If all validation passes, submit the form
            this.submit();
        });
    }

    // Add validation to login form
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            const emailInput = this.querySelector('input[name="email"]');

            if (!isValidEmail(emailInput.value)) {
                e.preventDefault();
                showValidationError('Email: Invalid email address.');
            }
        });
    }
});