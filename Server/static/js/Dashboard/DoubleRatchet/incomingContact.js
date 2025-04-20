import { Session } from './session.js';
import { saveSession } from './sessionStorage.js';
import { base64ToArrayBuffer, loadKeyMaterial } from '../../KeyStorage.js';

// Handle incoming contact request - setup crypto session as responder
async function handleIncomingContact(contactEmail) {
    try {
        console.debug('[CRYPTO] Setting up responder crypto for', contactEmail);

        // 1. Fetch the contact's prekey bundle to get their ratchet key
        const response = await fetch(`/api/keys/${contactEmail}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch keys for ${contactEmail}`);
        }

        const prekeyBundle = await response.json();

        // 2. Load our key material
        const ourKeyMaterial = await loadKeyMaterial();
        if (!ourKeyMaterial) {
            throw new Error('Failed to load our key material');
        }

        // 3. Get the X3DH parameters sent by the initiator
        const x3dhResponse = await fetch(`/api/x3dh_params/${contactEmail}`);
        if (!x3dhResponse.ok) {
            throw new Error(`Failed to get X3DH parameters from ${contactEmail}`);
        }

        const x3dhParams = await x3dhResponse.json();
        const theirEphemeralKey = base64ToArrayBuffer(x3dhParams.ephemeral_key);

        // 4. Calculate the shared secret using the same X3DH protocol
        const sharedSecret = await calculateResponderSharedSecret(
            ourKeyMaterial,
            theirEphemeralKey,
            prekeyBundle
        );

        // 5. Initialize a Double Ratchet session as responder
        const session = new Session(contactEmail);
        await session.initializeAsResponder(sharedSecret, base64ToArrayBuffer(prekeyBundle.identity_public_key));

        // 6. Store the session
        await saveSession(session);

        console.debug('[CRYPTO] Successfully set up responder crypto for', contactEmail);
        return session;
    } catch (error) {
        console.error('[CRYPTO] Error setting up responder crypto:', error);
        throw error;
    }
}

// Calculate shared secret as the responder in X3DH
async function calculateResponderSharedSecret(ourKeyMaterial, theirEphemeralKey, prekeyBundle) {
    // Calculate DH1: Their identity key + our signed prekey
    const dh1 = await window.libsignal.curve.calculateAgreement(
        base64ToArrayBuffer(prekeyBundle.identity_public_key),
        ourKeyMaterial.signedPreKey.privKey
    );

    // Calculate DH2: Their ephemeral key + our identity key
    const dh2 = await window.libsignal.curve.calculateAgreement(
        theirEphemeralKey,
        ourKeyMaterial.identityKeyPair.privKey
    );

    // Calculate DH3: Their ephemeral key + our signed prekey
    const dh3 = await window.libsignal.curve.calculateAgreement(
        theirEphemeralKey,
        ourKeyMaterial.signedPreKey.privKey
    );

    // Calculate DH4 if one-time prekey was used
    const oneTimePrekey = prekeyBundle.one_time_prekey?.prekey;
    let dh4 = new Uint8Array(0);
    if (oneTimePrekey) {
        const oneTimePreKeyPair = await loadOneTimePreKey(prekeyBundle.one_time_prekey.prekey_id);
        dh4 = await window.libsignal.curve.calculateAgreement(
            theirEphemeralKey,
            oneTimePreKeyPair.privKey
        );
    }

    // Concatenate DH outputs
    const dhOutputs = concatenateArrayBuffers(dh1, dh2, dh3, dh4);

    // Derive shared secret using HKDF
    const salt = new Uint8Array(32).buffer; // Zero salt
    const info = new TextEncoder().encode("X3DH");
    const sharedSecret = await window.libsignal.HKDF.deriveSecrets(
        dhOutputs,
        salt,
        info,
        32
    );

    return sharedSecret;
}

// Load the one-time prekey from storage
async function loadOneTimePreKey(preKeyId) {
    // Implementation depends on how you store prekeys
    // You would need to access the private key for the given preKeyId
    // This is just a placeholder
    return await window.libsignal.store.loadPreKey(preKeyId);
}

export { handleIncomingContact };