const KeyHelper = window.libsignal.KeyHelper;

    // Helper function for encoding ArrayBuffer to Base64
    function arrayBufferToBase64(buffer) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
    }

    // Generate identity key pair
    async function generateIdentityKeyPair() {
        try {
            return await KeyHelper.generateIdentityKeyPair();
        } catch (error) {
            console.error('Failed to generate identity key pair:', error);
            throw error;
        }
    }

    // Generate prekeys for X3DH (extended triple Diffie-Hellman) key exchange
    async function generatePreKeys(identityKeyPair) {
        try {
            // Generate a signed prekey
            const signedPreKey = await KeyHelper.generateSignedPreKey(
                identityKeyPair,
                Date.now() & 0xffff
            );

            // Generate one-time prekeys
            const preKeys = await Promise.all(
                Array.from({length: 100}, (_, i) =>
                    KeyHelper.generatePreKey(i + 1)
                )
            );

            return {signedPreKey, preKeys};
        } catch (error) {
            console.error('Failed to generate prekeys:', error);
            throw error;
        }
    }

    // Helper function to create all required keys
    async function createKeys() {
        try {
            console.log('Generating keys...');
            const identityKeyPair = await generateIdentityKeyPair();
            console.log('Identity key pair generated');

            const {signedPreKey, preKeys} = await generatePreKeys(identityKeyPair);
            console.log('Prekeys generated');

            // Map prekeys to a format suitable for the server
            const preKeysData = preKeys.map(pk => ({
                prekey_id: pk.keyId,
                prekey: arrayBufferToBase64(pk.keyPair.pubKey || pk.keyPair.publicKey)
            }));

            // Normalize property names to ensure consistency
            const normalizedKeys = {
                identityKeyPair: {
                    pubKey: identityKeyPair.pubKey || identityKeyPair.publicKey,
                    privKey: identityKeyPair.privKey || identityKeyPair.privateKey
                },
                signedPreKey: {
                    keyId: signedPreKey.keyId,
                    keyPair: {
                        pubKey: signedPreKey.keyPair.pubKey || signedPreKey.keyPair.publicKey,
                        privKey: signedPreKey.keyPair.privKey || signedPreKey.keyPair.privateKey
                    },
                    signature: signedPreKey.signature
                },
                preKeys: preKeys.map(pk => ({
                    keyId: pk.keyId,
                    prekey_id: pk.keyId, // Add for compatibility
                    prekey: arrayBufferToBase64(pk.keyPair.pubKey || pk.keyPair.publicKey),
                    keyPair: {
                        pubKey: pk.keyPair.pubKey || pk.keyPair.publicKey,
                        privKey: pk.keyPair.privKey || pk.keyPair.privateKey
                    }
                }))
            };

            return normalizedKeys;
        } catch (error) {
            console.error('Error in createKeys:', error);
            throw error;
        }
    }

    export { createKeys, arrayBufferToBase64 }