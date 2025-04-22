// Server/static/js/Dashboard/DoubleRatchet/contactCrypto.js
import { arrayBufferToBase64, base64ToArrayBuffer, loadKeyMaterial, getPreKey } from '../../KeyStorage.js';
import { Session } from './session.js';
import { saveSession } from './sessionStorage.js';
import { getCookie } from '../../utils.js';
import { socket } from '../socketHandlers.js';

// Constants
const CurveHelper = window.libsignal.Curve;
const X3DH_INFO = 'X3DH';
const ZERO_SALT = new Uint8Array(32).buffer;

/**
 * Setup cryptographic communication with a contact
 * @param {string} contactEmail - Email of the contact
 * @param {string} communicationEndpoint - Endpoint for communication expects : 'receiving' or 'requesting'
 * @returns {Promise<Session>} - Initialized Double Ratchet session
 */
async function setupCryptoForContact(contactEmail, communicationEndpoint) {
  try {
    console.debug('[CRYPTO] Setting up crypto for', contactEmail, 'as', communicationEndpoint);

    // Load our identity key
    // 1. Fetch the contact's prekey bundle
    const prekeyBundle = await fetchPrekeyBundle(contactEmail);

    const theirOneTimePreKeyId = prekeyBundle.one_time_prekey?.prekey_id ?? null;
    console.log(theirOneTimePreKeyId)

    // 2. Load our identity key
    const ourKeyMaterial = await loadKeyMaterial();
    if (!ourKeyMaterial) {
      throw new Error('Failed to load our key material');
    }

    if (communicationEndpoint === 'requesting') {
      // === INITIATOR PATH (one‑round handshake!) ===

      // 1) Generate our ephemeral key pair for X3DH
      const ourEphemeral = await CurveHelper.generateKeyPair();

      // 2) Derive the shared secret via X3DH
      const sharedSecret = await performX3DH(
          ourKeyMaterial,
          prekeyBundle,
          ourEphemeral
      );

      // 3) Send our ephemeral → server → responder
      await sendEphemeralKey(
          contactEmail,
          ourEphemeral.pubKey,
          prekeyBundle.one_time_prekey?.prekey_id
      );

      // 4) WAIT for exactly one ratchet_response, then finish init
      console.log("[CRYPTO] Waiting for ratchet_response from responder...");
      return new Promise((resolve, reject) => {
        socket.once('ratchet_response', async ({from, ratchet_key}) => {
          if (from !== contactEmail) {
            console.warn('got ratchet_response for', from, '– ignoring');
            return;
          }
          console.log("[CRYPTO] Received ratchet_response from:", from);
          const theirRatchetKey = base64ToArrayBuffer(ratchet_key);

          // 5) One‑shot initialize with BOTH the sharedSecret & theirRatchetKey
          const session = new Session(contactEmail);
          console.log("[CRYPTO] Initializing session as initiator…");
          await session.initializeAsInitiator(sharedSecret, theirRatchetKey);
          await saveSession(session);

          console.debug('[CRYPTO] Handshake complete – session ready for', contactEmail);
          resolve(session);
        });

        // (Optional) timeout if you want to reject after X seconds:
        // setTimeout(() => reject(new Error("Ratchet handshake timed out")), 15000);
      });
    }

    throw new Error(`Invalid communication endpoint: ${communicationEndpoint}`);
  } catch (e) {
    throw new Error(`[ContactCrypto] Error in setupCryptoForContact: ${e.message}`);
  }
}




/**
 * Fetch the prekey bundle for a contact
 * @param {string} contactEmail - Email of the contact
 * @returns {Promise<Object>} - Prekey bundle
 */
async function fetchPrekeyBundle(contactEmail) {
  const response = await fetch(`/api/keys`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRF-TOKEN': getCookie('csrf_access_token'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contact_email: contactEmail })
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch keys for ${contactEmail}: ${response.statusText}`);
  }

  const prekeyBundle = await response.json();
  console.debug('[CRYPTO] Received prekey bundle:', prekeyBundle);
  return prekeyBundle;
}

/**
 * Send the ephemeral key to the contact
 * @param {string} contactEmail - Email of the contact
 * @param {ArrayBuffer} ephemeralKey - The ephemeral public key
 * @param {string} preKeyId - The ID of the prekey
 */
async function sendEphemeralKey(contactEmail, ephemeralKey, preKeyId) {
  const ephemeralKeyBase64 = arrayBufferToBase64(ephemeralKey);
  const response = await fetch('/api/x3dh_params/ephemeral/send', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRF-TOKEN': getCookie('csrf_access_token'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient_email: contactEmail,
      ephemeral_key:    ephemeralKeyBase64,
      prekey_id:        preKeyId
    })
  });

  return response;
}

/**
 * 3. socketHandlers.js (Responder path)
 *  socketHandlers.js (Responder path)
 */

/**
 * Fetch another user's identity key
 * @param {string} email - The user's email
 * @returns {Promise<ArrayBuffer>} - Their identity key
 */
async function fetchIdentityKey(email) {
  const response = await fetch(`/api/identity_key`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRF-TOKEN': getCookie('csrf_access_token'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch identity key: ${response.statusText}`);
  }

  const data = await response.json();
  return base64ToArrayBuffer(data.identity_key);
}

/**
 * Perform X3DH key agreement
 * @param {Object} ourKeyMaterial - Our identity keys
 * @param {Object} theirPrekeyBundle - Contact's prekey bundle
 * @param {Object} ourEphemeralKeyPair - Our ephemeral key pair
 * @returns {Promise<ArrayBuffer>} - Derived shared secret
 */
async function performX3DH(ourKeyMaterial, theirPrekeyBundle, ourEphemeralKeyPair) {
  try {
    // Convert base64 encoded keys to ArrayBuffers
    const theirIdentityKey = base64ToArrayBuffer(theirPrekeyBundle.identity_public_key);
    const theirSignedPreKey = base64ToArrayBuffer(theirPrekeyBundle.signed_prekey);
    const theirOneTimePreKey = theirPrekeyBundle.one_time_prekey?.prekey ?
        base64ToArrayBuffer(theirPrekeyBundle.one_time_prekey.prekey) : null;

    console.log('DH inputs:', {
      theirIdentityKeyLength: theirIdentityKey.byteLength,
      theirIdentityKey: theirIdentityKey,
      theirSignedPreKeyLength: theirSignedPreKey.byteLength,
        theirSignedPreKey: theirSignedPreKey,
      ourKeyMaterial_identityKeyPair_privKey_length: ourKeyMaterial.identityKeyPair.privKey.byteLength,
        ourKeyMaterial_signedPrekey_keyPair_privKey: ourKeyMaterial.signedPreKey.keyPair.privKey,
        ourKeyMaterial_signedPrekey_keyPair_pubKey_length: ourKeyMaterial.signedPreKey.keyPair.pubKey.byteLength,
      ourEphemeralKeyPair_privKey: ourEphemeralKeyPair.privKey
    });

    // Calculate DH outputs
    const dh1 = await CurveHelper.calculateAgreement(
      theirSignedPreKey,
      ourKeyMaterial.identityKeyPair.privKey
    );

    const dh2 = await CurveHelper.calculateAgreement(
      theirIdentityKey,
      ourEphemeralKeyPair.privKey
    );

    const dh3 = await CurveHelper.calculateAgreement(
      theirSignedPreKey,
      ourEphemeralKeyPair.privKey
    );

    // Calculate DH4 if one-time prekey is available
    // todo verify this implementation if possible
    let dh4 = null;
    /*
    if (theirOneTimePreKey) {
      dh4 = await CurveHelper.calculateAgreement(
        theirOneTimePreKey,
        ourEphemeralKeyPair.privKey
      );

      console.log('pub prekey:', {
        dh4Length: theirOneTimePreKey.byteLength,
        dh4: theirOneTimePreKey
      });
    }*/

    // Concatenate DH outputs
    let concatenated;
    if (dh4) {
      concatenated = concatenateArrayBuffers(dh1, dh2, dh3, dh4);
    } else {
      concatenated = concatenateArrayBuffers(dh1, dh2, dh3);
    }

    console.log('DH outputs:', {
      dh1Length: dh1.byteLength,
        dh1: dh1,
      dh2Length: dh2.byteLength,
        dh2: dh2,
      dh3Length: dh3.byteLength,
        dh3: dh3,
    });
    if (dh4) {
        console.log('DH4:', {
            dh4Length: dh4.byteLength,
            dh4: dh4
        });
    }

    // Derive the shared secret using HKDF
    // Derive the shared secret
    // In Signal Protocol's implementation, HKDF.deriveSecrets returns an array of three ArrayBuffers:
    // - First buffer (index 0): Root Key - used to initialize the Double Ratchet
    // - Second buffer (index 1): Typically used as the sending chain key
    // - Third buffer (index 2): Typically used as the receiving chain key
    // This is normal behavior in Signal's implementation where key derivation produces
    // multiple cryptographic keys from the same input material
    const sharedSecrets = await window.libsignal.HKDF.deriveSecrets(
      concatenated,
      ZERO_SALT,
      new TextEncoder().encode(X3DH_INFO).buffer,
      32
    );

    // Return only the root key for session initialization
    return sharedSecrets[0];
  } catch (error) {
    console.error('[CRYPTO] Error in X3DH:', error);
    throw error;
  }
}


/**
 * Perform X3DH key agreement as recipient
 * @param {Object} ourKeyMaterial - Our key material including signed prekey
 * @param {string} theirEmail - Initiator's email
 * @param {ArrayBuffer} theirEphemeralKey - Initiator's ephemeral key
 * @param {Object} usedOneTimePrekey - Used one-time prekey (if any)
 * @returns {Promise<ArrayBuffer>} - Derived shared secret
 */
async function performX3DHasRecipient(ourKeyMaterial, theirEmail, theirEphemeralKey, usedOneTimePrekey) {
  try {
    console.log('[CRYPTO] Performing X3DH as recipient for', theirEmail);
    // 1. Get their identity key
    const theirIdentityKey = await fetchIdentityKey(theirEmail);

    console.log('DH inputs:', {
      ourKeyMaterial_signedPrekey_keyPair_privKey_length: ourKeyMaterial.signedPreKey.keyPair.privKey.byteLength,
        ourKeyMaterial_signedPrekey_keyPair_privKey: ourKeyMaterial.signedPreKey.keyPair.privKey,
      ourKeyMaterial_identityKeyPair_privKey_length: ourKeyMaterial.identityKeyPair.privKey.byteLength,
      ourKeyMaterial_identityKeyPair_privKey: ourKeyMaterial.identityKeyPair.privKey,
      theirEphemeralKeyLength: theirEphemeralKey.byteLength,
        theirEphemeralKey: theirEphemeralKey,
      theirIdentityKeyLength: theirIdentityKey.byteLength,
        theirIdentityKey: theirIdentityKey
    });


    // 2. Calculate DH outputs - PROPERLY MIRRORED from initiator's calculations
    // DH1: initiator uses (theirSignedPreKey, ourIdentityPrivKey)
    // Recipient should use (theirIdentityKey, ourSignedPreKeyPrivKey)
    const dh1 = await CurveHelper.calculateAgreement(
      theirIdentityKey,
      ourKeyMaterial.signedPreKey.keyPair.privKey
    );

    // DH2: initiator uses (theirIdentityKey, ourEphemeralPrivKey)
    // Recipient should use (theirEphemeralKey, ourIdentityPrivKey)
    const dh2 = await CurveHelper.calculateAgreement(
      theirEphemeralKey,
      ourKeyMaterial.identityKeyPair.privKey
    );

    // DH3: initiator uses (theirSignedPreKey, ourEphemeralPrivKey)
    // Recipient should use (theirEphemeralKey, ourSignedPreKeyPrivKey)
    const dh3 = await CurveHelper.calculateAgreement(
      theirEphemeralKey,
      ourKeyMaterial.signedPreKey.keyPair.privKey
    );

    // DH4: initiator uses (theirOneTimePreKey, ourEphemeralPrivKey)
    // Recipient should use (theirOneTimePreKey, ourEphemeralPrivKey)
    // todo verify this implementation too
    let dh4 = null;
    /*
    if (usedOneTimePrekey) {
      dh4 = await CurveHelper.calculateAgreement(
        theirEphemeralKey,
        usedOneTimePrekey.privKey
      );

      // Debug to verify the key format is correct
      console.log('One-time prekey DH4:', {
      ephemeralKeyLength: theirEphemeralKey.byteLength,
      oneTimePreKeyPrivLength: usedOneTimePrekey.privKey.byteLength
      });
    }*/

    // 3. Concatenate DH outputs in the SAME ORDER as initiator
    let concatenated;
    if (dh4) {
      concatenated = concatenateArrayBuffers(dh1, dh2, dh3, dh4);
    } else {
      concatenated = concatenateArrayBuffers(dh1, dh2, dh3);
    }

    console.log('DH outputs:', {
      dh1Length: dh1.byteLength,
      dh1: dh1,
      dh2Length: dh2.byteLength,
        dh2: dh2,
      dh3Length: dh3.byteLength,
        dh3: dh3
    });
    if (dh4) {
        console.log('DH4:', {
            dh4Length: dh4.byteLength,
            dh4: dh4
        });
    }

    // 4. Derive the shared secret using HKDF with IDENTICAL parameters
    const sharedSecrets = await window.libsignal.HKDF.deriveSecrets(
      concatenated,
      ZERO_SALT,
      new TextEncoder().encode(X3DH_INFO).buffer,
      32
    );

    // Return the root key for session initialization
    return sharedSecrets[0];
  } catch (error) {
    console.error('[CRYPTO] Error in X3DH as recipient:', error);
    throw error;
  }
}


/**
 * Concatenate multiple ArrayBuffers
 * @param {...ArrayBuffer} buffers - Array buffers to concatenate
 * @returns {ArrayBuffer} - Concatenated array buffer
 */
function concatenateArrayBuffers(...buffers) {
  const totalLength = buffers.reduce((length, buffer) => length + buffer.byteLength, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return result.buffer;
}

export { setupCryptoForContact, performX3DHasRecipient };