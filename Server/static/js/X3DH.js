import {getCookie} from "./utils.js";
import {storePreKey} from './KeyStorage.js';

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

async function refreshPreKeysIfNeeded() {
    console.log("[DEBUG] entered refreshPreKeysIfNeeded");

    const threshold = 20;
    const batchSize = 50;

    console.log("[DEBUG] fetching pre-key count");
    const res = await fetch("/api/prekeys/count", {
        credentials: "include",
        headers: {"X-CSRF-TOKEN": getCookie("csrf_access_token")},
    });
    console.log("[DEBUG] response status:", res.status);
    if (!res.ok) throw new Error("Failed to fetch prekey count");

    const {count} = await res.json();
    console.log("[DEBUG] server reports count =", count);

    if (count < threshold) {
        console.log(
            `[DEBUG] below threshold, generating ${batchSize} new pre-keys…]`
        );
        const newPreKeys = [];

        for (let i = 0; i < batchSize; i++) {
            console.log(`[DEBUG] generating pre-key #${i + 1}`);
            // ← Correct destructuring here:
            const {keyId, keyPair} = await KeyHelper.generatePreKey(i + 1);
            console.log("[DEBUG] got keyId =", keyId);

            const publicKeyArrayBuffer = keyPair.pubKey;
            const publicKeyBase64 = arrayBufferToBase64(publicKeyArrayBuffer);
            console.log("[DEBUG] encoded to Base64");

            await storePreKey(keyId, keyPair);
            console.log("[DEBUG] stored in KeyStorage:", keyId);

            newPreKeys.push({
                prekey_id: keyId,
                prekey: publicKeyBase64,
            });
        }

        // 3) Push them up:
        console.log("[DEBUG] uploading to /api/refreshpks");
        const up = await fetch("/api/refreshpks", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": getCookie("csrf_access_token"),
            },
            body: JSON.stringify({prekeys: newPreKeys}),
        });
        if (!up.ok) {
            console.error(
                "Failed to upload new prekeys:",
                up.status,
                await up.text()
            );
        } else {
            console.log("[DEBUG] upload succeeded");
        }
    } else {
        console.log(
            `[DEBUG] count (${count}) >= threshold (${threshold}), no action.`
        );
    }
}


export {createKeys, arrayBufferToBase64, refreshPreKeysIfNeeded}




