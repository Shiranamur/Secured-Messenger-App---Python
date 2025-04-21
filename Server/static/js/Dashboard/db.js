// Server/static/js/Dashboard/db.js
// Constants
const DB_NAME = 'SecureMessengerDB';
const DB_VERSION = 1;
const MESSAGES_STORE = 'messages';

/**
 * Promise for the database connection
 */
export const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = event => {
    const db = event.target.result;

    // Create messages store if it doesn't exist
    if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
      const store = db.createObjectStore(MESSAGES_STORE, {
        keyPath: 'localId',
        autoIncrement: true
      });

      // Create indexes
      store.createIndex('byContact', 'contactEmail');
      store.createIndex('byServerId', 'serverMessageId');
      store.createIndex('byRead', 'readFlag');
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

/**
 * Save a message to the database
 * @param {Object} message - Message object
 * @param {string|null} message.serverMessageId - Server message ID
 * @param {string} message.contactEmail - Contact email
 * @param {string} message.ciphertext - Message content
 * @param {string} message.direction - Message direction ('incoming' or 'outgoing')
 * @param {number} [message.timestamp=Date.now()] - Message timestamp
 * @param {boolean} [message.readFlag=false] - Read status
 * @returns {Promise<Event>} - Transaction complete promise
 */
export async function saveMessage({
  serverMessageId = null,
  contactEmail,
  ciphertext,
  direction,
  timestamp = Date.now(),
  readFlag = false
}) {
  try {
    const db = await dbPromise;
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');

    tx.objectStore(MESSAGES_STORE).put({
      serverMessageId,
      contactEmail,
      ciphertext,
      direction,
      timestamp,
      readFlag
    });

    return tx.complete;
  } catch (error) {
    console.error('[DB] Failed to save message:', error);
    throw error;
  }
}

/**
 * Get all messages for a contact
 * @param {string} contactEmail - Contact email
 * @returns {Promise<Array>} - Array of messages
 */
export async function getMessagesFor(contactEmail) {
  try {
    const db = await dbPromise;
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(MESSAGES_STORE);
    const index = store.index('byContact');
    const range = IDBKeyRange.only(contactEmail);

    const allMessages = await index.getAll(range);
    await tx.complete;

    return allMessages;
  } catch (error) {
    console.error('[DB] Failed to get messages:', error);
    throw error;
  }
}

/**
 * Mark a message as read
 * @param {number} localId - Local message ID
 * @returns {Promise<Event>} - Transaction complete promise
 */
export async function markAsRead(localId) {
  try {
    const db = await dbPromise;
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);

    const msg = await store.get(localId);
    if (msg) {
      msg.readFlag = true;
      store.put(msg);
    }

    return tx.complete;
  } catch (error) {
    console.error('[DB] Failed to mark message as read:', error);
    throw error;
  }
}

/**
 * Delete messages for a contact
 * @param {string} contactEmail - Contact email
 * @returns {Promise<Event>} - Transaction complete promise
 */
export async function deleteMessagesFor(contactEmail) {
  try {
    const db = await dbPromise;
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);
    const index = store.index('byContact');
    const range = IDBKeyRange.only(contactEmail);

    // Get all matching records
    const keys = await index.getAllKeys(range);

    // Delete each record
    for (const key of keys) {
      store.delete(key);
    }

    return tx.complete;
  } catch (error) {
    console.error('[DB] Failed to delete messages:', error);
    throw error;
  }
}