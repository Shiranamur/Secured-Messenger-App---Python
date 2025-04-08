document.getElementById('login-btn').addEventListener('click', function() {
    document.getElementById('login-form').classList.add('active-form');
    document.getElementById('register-form').classList.remove('active-form');
    this.classList.add('active');
    document.getElementById('register-btn').classList.remove('active');
});

document.getElementById('register-btn').addEventListener('click', function() {
    document.getElementById('register-form').classList.add('active-form');
    document.getElementById('login-form').classList.remove('active-form');
    this.classList.add('active');
    document.getElementById('login-btn').classList.remove('active');
});

//Filler code while waiting for libsignal protocol
function generatePhoneyKey() {
      // Create an array with 16 random bytes
      const randomBytes = new Uint8Array(16);
      window.crypto.getRandomValues(randomBytes);
      // Convert each byte to a 2-digit hexadecimal string and join them.
      return Array.from(randomBytes)
                  .map(b => ("0" + b.toString(16)).slice(-2))
                  .join('');
    }

    document.addEventListener('DOMContentLoaded', function() {
      const form = document.getElementById('register-form');

      form.addEventListener('submit', function(e) {
        // Prevent immediate submission to allow key generation.
        e.preventDefault();

        // Generate the phoney identity public key.
        const phoneyKey = generatePhoneyKey();
        console.log('Phoney key generated:', phoneyKey);

        // Insert the phoney key into the hidden field.
        document.getElementById('identity-public-key').value = phoneyKey;

        // Now submit the form—your server will receive the key along with other data.
        form.submit();
      });
    });