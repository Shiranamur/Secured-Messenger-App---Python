// Server/static/js/Dashboard/DoubleRatchet/sessionStorage.js

 // Import necessary dependencies
 import { base64ToArrayBuffer } from '../../KeyStorage.js';
 import { Session } from './session.js';

 const SESSION_STORE_NAME = 'double-ratchet-sessions';
 const DB_NAME = 'SessionsDB';
 const DB_VERSION = 1;

 /**
  * Open the sessions database
  * @returns {Promise<IDBDatabase>} - Database connection
  */
function initSessionsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('sessions')) {
        // Use contactEmail/sessionId as the keyPath
        const store = db.createObjectStore(SESSION_STORE_NAME, { keyPath: 'sessionId' });
        // Still keep the index for backward compatibility if needed
        store.createIndex('byContactEmail', 'contactEmail', { unique: true });
      }
    };

    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error);
  });
}

 /**
  * Save a session to the database
  * @param {Session} session - Session to save
  * @returns {Promise<void>}
  */
 async function saveSession(session) {
   if (!session || !session.contactEmail) {
     throw new Error('Invalid session object');
   }

   try {
     const db = await initSessionsDB();
     const tx = db.transaction([SESSION_STORE_NAME], 'readwrite');
     const store = tx.objectStore(SESSION_STORE_NAME);

     await new Promise((resolve, reject) => {
       const request = store.put(session.serialize());
       request.onsuccess = resolve;
       request.onerror = (event) => reject(event.target.error);
     });

     console.debug(`[SESSION] Saved session for ${session.contactEmail}`);
   } catch (error) {
     console.error('[SESSION] Error saving session:', error);
     throw error;
   }
 }

 /**
  * Get a session for a contact
  * @param {string} contactEmail - Contact email
  * @returns {Promise<Session|null>} - Session object or null if not found
  */
async function getSessionByContact(contactEmail) {
  try {
    const db = await initSessionsDB();
    const tx = db.transaction([SESSION_STORE_NAME], 'readonly');
    const store = tx.objectStore(SESSION_STORE_NAME);

    const request = store.get(contactEmail);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (request.result) {
          resolve(deserializeSession(request.result));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[SESSION] Error getting session:', error);
    return null;
  }
}

 function deserializeSession(sessionData) {
     // Recreate the session object from serialized data
     const session = new Session(sessionData.contactEmail, sessionData.sessionId);

     // Restore properties
     if (sessionData.DHs) {
       session.DHs = {
         pubKey: base64ToArrayBuffer(sessionData.DHs.pubKey),
         privKey: base64ToArrayBuffer(sessionData.DHs.privKey)
       };
     }

     if (sessionData.DHr) {
       session.DHr = base64ToArrayBuffer(sessionData.DHr);
     }

     if (sessionData.RK) {
       session.RK = base64ToArrayBuffer(sessionData.RK);
     }

     if (sessionData.CKs) {
       session.CKs = base64ToArrayBuffer(sessionData.CKs);
     }

     if (sessionData.CKr) {
       session.CKr = base64ToArrayBuffer(sessionData.CKr);
     }

     session.Ns = sessionData.Ns;
     session.Nr = sessionData.Nr;
     session.PN = sessionData.PN;
     session.initialized = sessionData.initialized;

     // Restore skipped message keys
     session.skippedMessageKeys = new Map(
       sessionData.skippedMessageKeys.map(([k, v]) => [k, base64ToArrayBuffer(v)])
     );
   return session;
 }

 export { saveSession, getSessionByContact };