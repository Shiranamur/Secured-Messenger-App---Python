document.addEventListener('DOMContentLoaded', function() {
    // Button toggle functionality
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


    const KeyHelper = window.libsignal.KeyHelper;

    // Helper function for encoding ArrayBuffer to Base64 (from encoding)
    function arrayBufferToBase64(buffer) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
    }


    // Generate identity key pair and store it in local storage
    async function generateIdentityKeyPair() {
        const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
        localStorage.setItem("identityKey.pub", arrayBufferToBase64(identityKeyPair.pubKey));
        localStorage.setItem("identityKey.priv", arrayBufferToBase64(identityKeyPair.privKey));
        return identityKeyPair;
    }

    // generate a X3DH (extended triple Diffie-Hellman) key echange
    // Generate prekeys and store them in localstorage
    async function generatePreKeys(identitykeyPair) {
        // generate a signed prekey
        const signedPreKey = await KeyHelper.generateSignedPreKey(
            identitykeyPair,
            0 // 0 is the key id
        );

        // Generate one-time prekeys
        const preKeys = await Promise.all(
            Array.from({length: 100}, (_, i) =>
                KeyHelper.generatePreKey(i + 1)
            )
        );

        // store locally
        localStorage.setItem('signedPreKey', JSON.stringify({
            keyId: signedPreKey.keyId,
            keyPair: {
                pubKey: arrayBufferToBase64(signedPreKey.keyPair.pubKey),
                privKey: arrayBufferToBase64(signedPreKey.keyPair.privKey)
            },
            signature: arrayBufferToBase64(signedPreKey.signature)
        }));

        // store pre-keys
        const serializedPreKeys = preKeys.map(pk => ({
            keyId: pk.keyId,
            keyPair: {
                pubKey: arrayBufferToBase64(pk.keyPair.pubKey),
                privKey: arrayBufferToBase64(pk.keyPair.privKey)
            }
        }))
        localStorage.setItem('prekeys', JSON.stringify(serializedPreKeys));

        return {signedPreKey, preKeys};
    }


    const form = document.getElementById('register-form');
    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        try {
            const identityKeyPair = await generateIdentityKeyPair();
            const {signedPreKey, preKeys} = await generatePreKeys(identityKeyPair);

            document.getElementById('identity-public-key').value =
                arrayBufferToBase64(identityKeyPair.pubKey);

            document.getElementById('signed-prekey').value =
                arrayBufferToBase64(signedPreKey.keyPair.pubKey);

            document.getElementById('signed-prekey-signature').value =
                arrayBufferToBase64(signedPreKey.signature);

            const preKeysData = preKeys.map(pk => ({
                prekey_id: pk.keyId,
                prekey: arrayBufferToBase64(pk.keyPair.pubKey)
            }));
            document.getElementById('prekeys').value = JSON.stringify(preKeysData);

            form.submit();
        } catch (error) {
            console.error('Error generating identity key pair:', error);
        }
    });
});

