// Input validation helper functions
function showValidationError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'flash error';
    errorDiv.textContent = message;
    const container = document.querySelector('.flash-messages') || document.createElement('div');
    if (!container.classList.contains('flash-messages')) {
        container.className = 'flash-messages';
        document.body.insertBefore(container, document.body.firstChild);
    }
    container.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

// Email validation
function isValidEmail(email) {
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    return re.test(email);
}

// Check base64 length matches expected byte length
function validateBase64Length(base64String, expectedBytes, fieldName) {
    try {
        // Remove any base64 padding if present
        const cleanBase64 = base64String.replace(/=+$/, '');

        // Decode and check length
        const decoded = atob(cleanBase64);


        // Accept format byte for cryptographic keys (33 bytes instead of 32)
        if (expectedBytes === 32 && decoded.length === 33) {
            return true;
        }

        if (decoded.length !== expectedBytes) {
            showValidationError(`${fieldName} must be ${expectedBytes} bytes (got ${decoded.length})`);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Base64 validation error:', e);
        showValidationError(`${fieldName} is not valid Base64`);
        return false;
    }
}
// Export functions for potential reuse
export { isValidEmail, validateBase64Length, showValidationError };