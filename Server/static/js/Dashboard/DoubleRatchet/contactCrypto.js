import { arrayBufferToBase64, base64ToArrayBuffer, loadKeyMaterial } from '../../KeyStorage.js';
import { Session } from './session.js';
import { saveSession } from './sessionStorage.js';
import { getCookie } from '../../utils.js';
const CurveHelper = window.libsignal.Curve;
// contactCrypto.js - Handle cryptographic setup for contacts


// Performs X3DH key agreement with a new contact
async function setupCryptoForContact(contactEmail) {
  try {
    console.debug('[CRYPTO] Setting up crypto for', contactEmail);

    // 1. Fetch the contact's prekey bundle
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

    // 2. Load our identity key
    const ourKeyMaterial = await loadKeyMaterial();
    if (!ourKeyMaterial) {
      throw new Error('Failed to load our key material');
    }

    // 3. Generate our ephemeral key pair for X3DH
    const ourEphemeralKeyPair = await CurveHelper.generateKeyPair();

    // 4. Perform X3DH to establish shared secret
    const sharedSecret = await performX3DH(ourKeyMaterial, prekeyBundle, ourEphemeralKeyPair);

    // 5. Send the ephemeral public key to the contact so they can derive the same shared secret
    const ephemeralKeyBase64 = arrayBufferToBase64(ourEphemeralKeyPair.pubKey);
    await fetch('/api/x3dh_params', {
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
    })

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

async function performX3DH(ourKeyMaterial, theirPrekeyBundle, ourEphemeralKeyPair) {
  try {
    // Convert base64 encoded keys to ArrayBuffers
    const theirIdentityKey = base64ToArrayBuffer(theirPrekeyBundle.identity_public_key);
    const theirSignedPreKey = base64ToArrayBuffer(theirPrekeyBundle.signed_prekey);
    const theirOneTimePreKey = theirPrekeyBundle.one_time_prekey?.prekey ?
        base64ToArrayBuffer(theirPrekeyBundle.one_time_prekey.prekey) : null;

    console.log('DH inputs:', {
      theirIdentityKeyLength: theirIdentityKey.byteLength,
      theirSignedPreKeyLength: theirSignedPreKey.byteLength,
      theirOneTimePreKeyLength: theirOneTimePreKey?.byteLength || 0
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

    console.log('DH outputs:', {
      dh1Length: dh1.byteLength,
      dh2Length: dh2.byteLength,
      dh3Length: dh3.byteLength
    });


    // // Calculate DH4 if one-time prekey is available
    // let dh4 = new Uint8Array(0);
    // if (theirOneTimePreKey) {
    //   dh4 = await CurveHelper.calculateAgreement(
    //     theirOneTimePreKey,
    //     ourEphemeralKeyPair.privKey
    //   );
    // }

    // Define the missing variables for logging and concatenation
    const dh1Bytes = new Uint8Array(dh1);
    const dh2Bytes = new Uint8Array(dh2);
    const dh3Bytes = new Uint8Array(dh3);

    // Concatenate DH outputs into a single ArrayBuffer
    const concatenated = new Uint8Array(dh1Bytes.length + dh2Bytes.length + dh3Bytes.length);
    concatenated.set(dh1Bytes, 0);
    concatenated.set(dh2Bytes, dh1Bytes.length);
    concatenated.set(dh3Bytes, dh1Bytes.length + dh2Bytes.length);
    // const inputKeyMaterial = concatenated.buffer;

    // Create a 32-byte zeroed salt as an ArrayBuffer
    const salt = new Uint8Array(32).buffer;
    // Convert info string to Uint8Array if needed; here leaving as string
    const infoBuffer = new TextEncoder().encode("X3DH").buffer;

    console.log('Input key material:', {
        length: concatenated.length,
        dh1Length: dh1Bytes.length,
        dh2Length: dh2Bytes.length,
        dh3Length: dh3Bytes.length,
        // dh4Length: dh4 ? new Uint8Array(dh4).length : 0
        type: typeof concatenated,
        salt: salt,
        info: infoBuffer
    });

    // Derive the shared secret
    // In Signal Protocol's implementation, HKDF.deriveSecrets returns an array of three ArrayBuffers:
    // - First buffer (index 0): Root Key - used to initialize the Double Ratchet
    // - Second buffer (index 1): Typically used as the sending chain key
    // - Third buffer (index 2): Typically used as the receiving chain key
    // This is normal behavior in Signal's implementation where key derivation produces
    // multiple cryptographic keys from the same input material
    const sharedSecret = await window.libsignal.HKDF.deriveSecrets(
        concatenated.buffer,  // Combined DH outputs as input key material
        salt,                 // 32-byte zeroed salt
        infoBuffer,           // Context info ("X3DH")
        32                    // Length of each derived key in bytes
    );

    console.log("Shared secret type:", typeof sharedSecret);
    let secret;
    for (secret of sharedSecret) {
        console.log("Shared secret byte:", secret);
    }
    // When initializing a new Double Ratchet session, we should return just the first buffer (root key)
    // instead of the entire array to properly follow the Signal protocol specification
    return sharedSecret[0]; // Return only the root key for session initialization

  } catch (error) {
    console.error('Error in X3DH:', error);
    throw error;
  }
}

// Helper function to concatenate ArrayBuffers
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