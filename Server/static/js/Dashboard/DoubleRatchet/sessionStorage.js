// SessionStorage.js - Store Double Ratchet sessions
const DB_NAME = 'signal-sessions';
const DB_VERSION = 1;

function openSessionDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { keyPath: 'sessionId' });
        store.createIndex('contactEmail', 'contactEmail', { unique: true });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function saveSession(session) {
  try{
    // Check if session is already stored
    const existingSession = await getSessionByContact(session.contactEmail);
    if (existingSession) {
      console.debug('[SessionStorage] Session already exists, updating...');
      session.sessionId = existingSession.sessionId; // Update session ID to match existing session
    }
    // Store the session in indexedDB
    const db = await openSessionDB();
    const transaction = db.transaction(['sessions'], 'readwrite');
    const store = transaction.objectStore('sessions');
    const request = store.put(session.serialize());
    request.onsuccess = () => {
      console.debug('[SessionStorage] Stored session in indexedDB');
    };
    request.onerror = (event) => {
        console.error('[SessionStorage] Error storing session:', event.target.error);
    }
  }
  catch (error) {
    console.error('[SessionStorage] Error saving session:', error);
  }
}

async function getSessionByContact(contactEmail) {
  const db = await openSessionDB();
  const transaction = db.transaction(['sessions'], 'readonly');
  const store = transaction.objectStore('sessions');

  return new Promise((resolve, reject) => {
    const index = store.index('contactEmail');
    const request = index.get(contactEmail);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

export { saveSession, getSessionByContact };