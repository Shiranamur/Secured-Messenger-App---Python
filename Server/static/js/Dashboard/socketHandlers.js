import { updateContactsList } from './contacts.js';
import { appendMessage } from './conversation.js';
import { handleIncomingContact } from './DoubleRatchet/incomingContact.js';
import { getCookie } from '../utils.js';
import { dbPromise } from './db.js';

const socket = io('/', {
  extraHeaders: {
    'Authorization': `Bearer ${getCookie('access_token_cookie')}`
  }
});

function setupSocketHandlers() {
  socket.on('connect', () => console.debug('[WS] Connected'));

  socket.on('message', async (payload) => {
    console.debug('[WS] Received message event', payload);
    const {from, ciphertext, id} = payload;
    // Assume window.currentContactEmail is set when a contact is selected.
    if (from !== window.currentContactEmail) {
      console.debug('[WS] Message is for another contact, ignoring');
      return;
    }
    appendMessage(ciphertext, 'incoming');

    try {
      const db = await dbPromise;
      const tx = db.transaction('messages', 'readwrite');
      tx.objectStore('messages').add({
        serverMessageId: id,
        contactEmail: from,
        ciphertext,
        direction: 'incoming',
        timestamp: Date.now(),
        readFlag: false
      });
      await tx.complete;
    } catch (e) {
      console.error('[DB] Failed to save incoming message', e);
    }
  });

  socket.on('contacts_list', (data) => {
    console.debug('[WS] Received contacts:', data);
    updateContactsList(data.contacts);
  });

  socket.on('message_sent', async ({ id }) => {
    console.debug('[WS] Message sent with ID:', id);

    try {
      const db = await dbPromise;
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      const idx = store.index('byContact');
      const range = IDBKeyRange.only(window.currentContactEmail);

      const recs = await new Promise((resolve, reject) => {
        const req = idx.getAll(range);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      });

      const pending = recs.find(m =>
        m.direction === 'outgoing' && m.serverMessageId == null
      );

      if (pending) {
        pending.serverMessageId = id;
        store.put(pending);
      }

      await new Promise(resolve => { tx.oncomplete = resolve });

    } catch (e) {
      console.error('[DB] Failed to update serverMessageId', e);
    }
  });

  socket.on('error', (error) => {
    console.error('[WS] Socket error:', error);
    alert(`Error: ${error.error}`);
  });

  socket.on('disconnect', () => {
    console.debug('[WS] Disconnected');
    const statusEl = document.createElement('div');
    statusEl.className = 'connection-status disconnected';
    statusEl.textContent = 'Connection lost. Reconnecting...';
    document.body.appendChild(statusEl);
  });

  socket.on('reconnect', () => {
    console.debug('[WS] Reconnected');
    document.querySelector('.connection-status')?.remove();
  });

  socket.on('x3dh_params_ready', async (data) => {
    console.debug('[WS] X3DH parameters ready from:', data.from);
    try {
      // Initialize crypto as a responder
      await handleIncomingContact(data.from);
      console.debug('[WS] Crypto session established for new contact');

      // Update contact list to reflect the new secure connection
      updateContactsList();
    } catch (error) {
      console.error('[WS] Failed to setup crypto for new contact:', error);
    }
  });
}

export { socket, setupSocketHandlers };