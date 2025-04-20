export const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('SecureMessengerDB', 1);

    req.onupgradeneeded = e => {
        const db = e.target.result;
        const store = db.createObjectStore('messages', {
            keyPath: 'localId',
            autoIncrement: true
        });
        store.createIndex('byContact', 'contactEmail');
        store.createIndex('byServerId', 'serverMessageId');
        store.createIndex('byRead', 'readFlag');
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

export async function saveMessage({
  serverMessageId = null,
  contactEmail,
  ciphertext,
  direction,
  timestamp = Date.now(),
  readFlag = false
}) {
  const db = await dbPromise;
  const tx = db.transaction('messages', 'readwrite');
  tx.objectStore('messages').put({
    serverMessageId, contactEmail, ciphertext,
    direction, timestamp, readFlag
  });
  return tx.complete;
}

export async function getMessagesFor(contactEmail) {
  const db = await dbPromise;
  const tx = db.transaction('messages', 'readonly');
  const store = tx.objectStore('messages');
  const index = store.index('byContact');
  const range = IDBKeyRange.only(contactEmail);
  const allMessages = await index.getAll(range);
  await tx.complete;
  return allMessages;
}

export async function markAsRead(localId) {
  const db = await dbPromise;
  const tx = db.transaction('messages', 'readwrite');
  const store = tx.objectStore('messages');
  const msg = await store.get(localId);
  msg.readFlag = true;
  store.put(msg);
  return tx.complete;
}
