// Server/static/js/Dashboard/DoubleRatchet/contactCrypto.js
import { arrayBufferToBase64, base64ToArrayBuffer, loadKeyMaterial } from '../../KeyStorage.js';
import { Session } from './session.js';
import { saveSession } from './sessionStorage.js';
import { getCookie } from '../../utils.js';
import {storeContact} from "../ContactStorage.js";

// Constants
const CurveHelper = window.libsignal.Curve;
const X3DH_INFO = 'X3DH';
const ZERO_SALT = new Uint8Array(32).buffer;

/**
 * Setup cryptographic communication with a contact
 * @param {string} contactEmail - Email of the contact
 * @param {string} communciationEndpoint - Endpoint for communication expects : 'receiving' or 'requesting'
 * @returns {Promise<Session>} - Initialized Double Ratchet session
 */
async function setupCryptoForContact(contactEmail, communciationEndpoint) {
  try {
    console.debug('[CRYPTO] Setting up crypto for', contactEmail, 'as', communciationEndpoint);

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

    let session;

    if (communciationEndpoint === 'requesting') {
      // === INITIATOR PATH ===

      // 1. Fetch the contact's prekey bundle
      const prekeyBundle = await fetchPrekeyBundle(contactEmail);

      // 2. Generate our ephemeral key pair for X3DH
      const ourEphemeralKeyPair = await CurveHelper.generateKeyPair();

      // 3. Perform X3DH to establish shared secret
      const sharedSecret = await performX3DH(ourKeyMaterial, prekeyBundle, ourEphemeralKeyPair);

      // 4. Send the ephemeral key to the contact
        await sendEphemeralKey(contactEmail, ourEphemeralKeyPair.pubKey, theirOneTimePreKeyId);

      // 5. Initialize a Double Ratchet session as initiator
      session = new Session(contactEmail);
      await session.initializeAsInitiator(sharedSecret);

    } else {
      throw new Error(`Invalid communication endpoint: ${communciationEndpoint}`);
    }

    // Store the session
    await saveSession(session);

    console.debug('[CRYPTO] Successfully set up crypto for', contactEmail);
    return session;

  } catch (error) {
    console.error('[CRYPTO] Error setting up crypto for contact:', error);
    throw error;
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
 * Fetch the ephemeral key sent by the initiator
 * @param {string} initiatorEmail - Email of the initiator
 * @returns {Promise<string>} - Base64 encoded ephemeral key
 */
async function fetchEphemeralKey(initiatorEmail) {
  const response = await fetch(`/api/x3dh_params/ephemeral/retrieve`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRF-TOKEN': getCookie('csrf_access_token'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({sender_email: initiatorEmail})
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ephemeral key: ${response.statusText}`);
  }

  const data = await response.json();
  return data.ephemeral_key;
}

/**
 * Send the ephemeral key to the contact
 * @param {string} contactEmail - Email of the contact
 * @param {ArrayBuffer} ephemeralKey - The ephemeral public key
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
      ephemeral_key: ephemeralKeyBase64,
      prekey_id : preKeyId
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send ephemeral key: ${response.statusText}`);
  }

  return response.json();
}

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

    // Concatenate DH outputs
    const concatenated = concatenateArrayBuffers(dh1, dh2, dh3);

    console.log('DH outputs:', {
      dh1Length: dh1.byteLength,
        dh1: dh1,
      dh2Length: dh2.byteLength,
        dh2: dh2,
      dh3Length: dh3.byteLength,
        dh3: dh3
    });

    // // Calculate DH4 if one-time prekey is available
    // let dh4 = new Uint8Array(0);
    // if (theirOneTimePreKey) {
    //   dh4 = await CurveHelper.calculateAgreement(
    //     theirOneTimePreKey,
    //     ourEphemeralKeyPair.privKey
    //   );
    // }

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
 * @returns {Promise<ArrayBuffer>} - Derived shared secret
 */
async function performX3DHasRecipient(ourKeyMaterial, theirEmail, theirEphemeralKey) {
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

    // 3. Concatenate DH outputs in the SAME ORDER as initiator
    const concatenated = concatenateArrayBuffers(dh1, dh2, dh3);

    console.log('DH outputs:', {
      dh1Length: dh1.byteLength,
      dh1: dh1,
      dh2Length: dh2.byteLength,
        dh2: dh2,
      dh3Length: dh3.byteLength,
        dh3: dh3
    });

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

export { setupCryptoForContact };

// After exporting everything, use dynamic import for socket
// This ensures the module is fully loaded before accessing socket
import('../socketHandlers.js').then(module => {
  const socket = module.socket;

  // Now set up the event handler
  socket.on('ephemeral_key', async (payload) => {
    // === RECIPIENT PATH ===
    const ephemeralKey = payload.ephemeral_key;
    const ourKeyMaterial = await loadKeyMaterial();

    try {
      const sharedSecret = await performX3DHasRecipient(
          ourKeyMaterial,
          payload.from,
          base64ToArrayBuffer(ephemeralKey)
      );
      const session = new Session(payload.from);
      await session.initializeAsInitiator(sharedSecret);

      await saveSession(session);
    }
    catch (error) {
      console.error('[CRYPTO] Error during X3DH recipient:', error);
      return;
    }


  });
}).catch(error => {
  console.error('[CRYPTO] Error loading socket:', error);
});