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

// helper function to create keys
async function createKeys() {
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

        return {
            identityKeyPair,
            signedPreKey,
            preKeys
        };
    } catch (error) {
        console.error('Error generating identity key pair:', error);
    }
}

export { createKeys }