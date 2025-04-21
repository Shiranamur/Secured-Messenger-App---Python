// Server/static/js/Dashboard/DoubleRatchet/contactCrypto.js
import { arrayBufferToBase64, base64ToArrayBuffer, loadKeyMaterial } from '../../KeyStorage.js';
import { Session } from './session.js';
import { saveSession } from './sessionStorage.js';
import { getCookie } from '../../utils.js';

// Constants
const CurveHelper = window.libsignal.Curve;
const X3DH_INFO = 'X3DH';
const ZERO_SALT = new Uint8Array(32).buffer;

/**
 * Setup cryptographic communication with a contact
 * @param {string} contactEmail - Email of the contact
 * @returns {Promise<Session>} - Initialized Double Ratchet session
 */
async function setupCryptoForContact(contactEmail) {
  try {
    console.debug('[CRYPTO] Setting up crypto for', contactEmail);

    // 1. Fetch the contact's prekey bundle
    const prekeyBundle = await fetchPrekeyBundle(contactEmail);

    // 2. Load our identity key
    const ourKeyMaterial = await loadKeyMaterial();
    if (!ourKeyMaterial) {
      throw new Error('Failed to load our key material');
    }

    // 3. Generate our ephemeral key pair for X3DH
    const ourEphemeralKeyPair = await CurveHelper.generateKeyPair();

    // 4. Perform X3DH to establish shared secret
    const sharedSecret = await performX3DH(ourKeyMaterial, prekeyBundle, ourEphemeralKeyPair);

    // 5. Send the ephemeral public key to the contact
    await sendEphemeralKey(contactEmail, ourEphemeralKeyPair.pubKey);

    // 6. Initialize a Double Ratchet session
    const session = new Session(contactEmail);
    await session.initializeAsInitiator(sharedSecret);

    // 7. Store the session
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
 * Send the ephemeral key to the contact
 * @param {string} contactEmail - Email of the contact
 * @param {ArrayBuffer} ephemeralKey - The ephemeral public key
 */
async function sendEphemeralKey(contactEmail, ephemeralKey) {
  const ephemeralKeyBase64 = arrayBufferToBase64(ephemeralKey);
  const response = await fetch('/api/x3dh_params', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRF-TOKEN': getCookie('csrf_access_token'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient_email: contactEmail,
      ephemeral_key: ephemeralKeyBase64
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send ephemeral key: ${response.statusText}`);
  }

  return response.json();
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

    // Derive the shared secret using HKDF
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