// KeyStorage.js

const DB_NAME    = 'signal-keys';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys');
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror   = (e) => reject(e.target.error);
  });
}

function runInStore(storeName, mode, operation) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction([storeName], mode);
      const store = tx.objectStore(storeName);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror   = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  return btoa(
    String.fromCharCode.apply(null, new Uint8Array(buffer))
  );
}

// Convert Base64 to ArrayBuffer
function base64ToArrayBuffer(str) {
  const binary = atob(str);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Normalize either { pubKey, privKey } or { publicKey, privateKey }
function normalizeKeyPair(kp) {
  return {
    pub:  kp.pubKey      || kp.publicKey,
    priv: kp.privKey     || kp.privateKey
  };
}

// Encode every ArrayBuffer in an object to Base64 strings
function encodeBuffers(map) {
  const out = {};
  for (const [field, buf] of Object.entries(map)) {
    out[field] = arrayBufferToBase64(buf);
  }
  return out;
}

function decodeBuffers(map) {
  const out = {};
  for (const [field, val] of Object.entries(map)) {
    if (typeof val === 'string') {
      try {
        console.debug(`Decoding field "${field}":`, val);
        out[field] = base64ToArrayBuffer(val);
      } catch (err) {
        console.error(`Failed to decode Base64 for "${field}":`, val);
        throw err;
      }
    } else {
      out[field] = val;
    }
  }
  return out;
}

// Merge non-buffer extras (e.g. { keyId }) with the encoded buffer fields
function buildRecord({ buffers, extras = {} }) {
  return { ...extras, ...encodeBuffers(buffers) };
}

function setItem(key, value) {
  return runInStore('keys', 'readwrite', store =>
    store.put(value, key)
  );
}

function getItem(key) {
  return runInStore('keys', 'readonly', store =>
    store.get(key)
  );
}

async function storeKeyPair(storageKey, keyPair) {
  const { pub, priv } = normalizeKeyPair(keyPair);
  const record = buildRecord({ buffers: { pub, priv } });
  await setItem(storageKey, record);
}

async function loadKeyPair(storageKey) {
  const rec = await getItem(storageKey);
  if (!rec) return null;
  const { pub, priv } = decodeBuffers(rec);
  return { pubKey: pub, privKey: priv };
}

async function loadSignedPreKey() {
    const rec = await getItem('signedPreKey');
    if (!rec) return null;

    const { pub, priv, sig, keyId } = decodeBuffers(rec);
    return {
        keyId: keyId,
        keyPair: {
        pubKey: pub,
        privKey: priv
        },
        signature: sig
    };
}

// Persist all key material in three steps
async function persistKeyMaterial(keyMaterial) {
  if (!keyMaterial) return false;

  try {
    console.log(
      'Key material structure:',
      JSON.stringify(
        keyMaterial,
        (k, v) => v instanceof ArrayBuffer ? '[ArrayBuffer]' : v
      )
    );

    // 1) Identity key
    const idPair   = normalizeKeyPair(keyMaterial.identityKeyPair);
    const idRecord = buildRecord({ buffers: { pub: idPair.pub, priv: idPair.priv } });
    await setItem('identityKey', idRecord);

    // 2) Signed pre-key
    const sp        = keyMaterial.signedPreKey;
    const spPair    = normalizeKeyPair(sp.keyPair);
    const spBuffers = { pub: spPair.pub, priv: spPair.priv, sig: sp.signature };
    const spRecord  = buildRecord({ buffers: spBuffers, extras: { keyId: sp.keyId } });
    await setItem('signedPreKey', spRecord);

    // 3) One-time pre-keys
    for (const pk of keyMaterial.preKeys) {
      if (pk.keyId == null) continue;
      const onePair   = normalizeKeyPair(pk.keyPair);
      const oneRecord = buildRecord({ buffers: { pub: onePair.pub, priv: onePair.priv } });
      await setItem(`prekey-${pk.keyId}`, oneRecord);
    }

    return true;
  } catch (err) {
    console.error('Failed to persist key material:', err);
    return false;
  }
}
async function loadKeyMaterial() {
  try {
    // Load identity key and signed prekey using existing helper functions
    const identityKey = await loadKeyPair('identityKey');
    const signedPreKey = await loadSignedPreKey();

    if (!identityKey || !signedPreKey) {
      console.warn('Missing identityKey or signedPreKey in IndexedDB');
      return null;
    }

    // Get the next available prekey ID
    const nextPreKeyId = await getNextAvailablePreKeyId();

    // Use existing helper to get one prekey (the one before the next available)
    const preKeyId = Math.max(1, nextPreKeyId - 1);
    const preKey = await getPreKey(preKeyId);

    // Create the prekeys array with just one prekey
    const preKeys = preKey ? [
      {
        keyId: preKeyId,
        keyPair: {
          pubKey: preKey.pubKey,
          privKey: preKey.privKey
        }
      }
    ] : [];

    return {
      identityKeyPair: {
        pubKey: identityKey.pubKey,
        privKey: identityKey.privKey
      },
      signedPreKey: {
        keyId: signedPreKey.keyId,
        keyPair: {
          pubKey: signedPreKey.keyPair.pubKey,
          privKey: signedPreKey.keyPair.privKey
        },
        signature: signedPreKey.signature
      },
      preKeys: preKeys
    };
  } catch (error) {
    console.error('Failed to load key material:', error);
    return null;
  }
}

// One‑time pre-key store/get
async function storePreKey(preKeyId, keyPair) {
  return storeKeyPair(`prekey-${preKeyId}`, keyPair);
}

async function getPreKey(preKeyId) {
  return loadKeyPair(`prekey-${preKeyId}`);
}

async function deletePreKey(preKeyId) {
  const db = await openDB();
  const tx = db.transaction('keys', 'readwrite');
  const store = tx.objectStore('keys');
  const keyName = `oneTimePreKey_${preKeyId}`;
  store.delete(keyName);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function getNextAvailablePreKeyId() {
  const db = await openDB();
  const tx = db.transaction(['keys'], 'readonly');
  const store = tx.objectStore('keys');
  const request = store.getAllKeys();

  const keys = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });

  // Extract existing prekey IDs
  const usedIds = keys
    .filter(key => String(key).startsWith('prekey-'))
    .map(key => parseInt(key.split('-')[1], 10));

  // Find the next available ID (starting from 1)
  let nextId = 1;
  while (usedIds.includes(nextId)) {
    nextId++;
  }

  return nextId;
}


export {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  persistKeyMaterial,
  loadKeyMaterial,
  getItem,
  setItem,
  storePreKey,
  getPreKey,
  deletePreKey
};