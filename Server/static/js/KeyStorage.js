// KeyStorage.js
const DB_NAME = 'signal-keys';
const DB_VERSION = 1;

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
}

// Convert Base64 to ArrayBuffer
function base64ToArrayBuffer(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Open database connection
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys');
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Store a value with given key
async function setItem(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['keys'], 'readwrite');
    const store = transaction.objectStore('keys');
    const request = store.put(value, key);

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

// Get a value by key
async function getItem(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['keys'], 'readonly');
    const store = transaction.objectStore('keys');
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Persist all key material
async function persistKeyMaterial(keyMaterial) {
  if (!keyMaterial) return false;

  try {
    console.log('Key material structure:', JSON.stringify(keyMaterial, (key, value) => {
      if (value instanceof ArrayBuffer) return '[ArrayBuffer]';
      return value;
    }));

    // Store identity key
    await setItem('identityKey', {
      pub: arrayBufferToBase64(keyMaterial.identityKeyPair.pubKey),
      priv: arrayBufferToBase64(keyMaterial.identityKeyPair.privKey)
    });

    // Store signed prekey (handle different possible property names)
    const signedPreKeyPub = keyMaterial.signedPreKey.keyPair.pubKey ||
                           keyMaterial.signedPreKey.keyPair.publicKey;
    const signedPreKeyPriv = keyMaterial.signedPreKey.keyPair.privKey ||
                            keyMaterial.signedPreKey.keyPair.privateKey;

    await setItem('signedPreKey', {
      keyId: keyMaterial.signedPreKey.keyId,
      pub: arrayBufferToBase64(signedPreKeyPub),
      priv: arrayBufferToBase64(signedPreKeyPriv),
      sig: arrayBufferToBase64(keyMaterial.signedPreKey.signature)
    });

    // Store one-time prekeys
    for (const pk of keyMaterial.preKeys) {
      // Make sure keyId is defined and correct
      if (pk.keyId === undefined) continue;

      const pkPub = pk.keyPair.pubKey || pk.keyPair.publicKey;
      const pkPriv = pk.keyPair.privKey || pk.keyPair.privateKey;

      await setItem(`prekey-${pk.keyId}`, {
        pub: arrayBufferToBase64(pkPub),
        priv: arrayBufferToBase64(pkPriv)
      });
    }

    return true;
  } catch (error) {
    console.error('Failed to persist key material:', error);
    return false;
  }
}

export {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  persistKeyMaterial,
  loadKeyMaterial,
  getItem,
  setItem
};

// Retrieve all stored key material
async function loadKeyMaterial() {
  try {
    const identityKey = await getItem('identityKey');
    const signedPreKey = await getItem('signedPreKey');

    return {
      identityKeyPair: {
        pubKey: base64ToArrayBuffer(identityKey.pub),
        privKey: base64ToArrayBuffer(identityKey.priv)
      },
      signedPreKey: {
        keyId: signedPreKey.keyId,
        keyPair: {
          publicKey: base64ToArrayBuffer(signedPreKey.pub),
          privateKey: base64ToArrayBuffer(signedPreKey.priv)
        },
        signature: base64ToArrayBuffer(signedPreKey.sig)
      }
    };
  } catch (error) {
    console.error('Failed to load key material:', error);
    return null;
  }
}