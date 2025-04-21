// Server/static/js/Dashboard/DoubleRatchet/sessionStorage.js
import { Session } from './session.js';
import { base64ToArrayBuffer } from '../../KeyStorage.js';

// Constants
const DB_NAME = 'signal-sessions';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

/**
 * Open the sessions database
 * @returns {Promise<IDBDatabase>} - The database instance
 */
function openSessionDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
        store.createIndex('contactEmail', 'contactEmail', { unique: true });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Save a session to the database
 * @param {Session} session - The session to save
 * @returns {Promise<void>}
 */
async function saveSession(session) {
  try {
    // Check if session is already stored
    const existingSession = await getSessionByContact(session.contactEmail);
    if (existingSession) {
      console.debug('[SessionStorage] Session already exists, updating...');
      session.sessionId = existingSession.sessionId;
    }

    // Store the session in IndexedDB
    const db = await openSessionDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(session.serialize());

      request.onsuccess = () => {
        console.debug('[SessionStorage] Stored session in IndexedDB');
        resolve();
      };

      request.onerror = (event) => {
        console.error('[SessionStorage] Error storing session:', event.target.error);
        reject(event.target.error);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[SessionStorage] Error saving session:', error);
    throw error;
  }
}

/**
 * Get a session for a specific contact
 * @param {string} contactEmail - Email of the contact
 * @returns {Promise<Object|null>} - The session or null if not found
 */
async function getSessionByContact(contactEmail) {
  try {
    const db = await openSessionDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('contactEmail');
      const request = index.get(contactEmail);

      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };

      request.onerror = (event) => {
        db.close();
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[SessionStorage] Error getting session:', error);
    return null;
  }
}

export { saveSession, getSessionByContact };