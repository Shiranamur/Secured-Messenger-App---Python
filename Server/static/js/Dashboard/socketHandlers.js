// Server/static/js/Dashboard/socketHandlers.js
import { loadPendingRequests } from './contacts.js';
import { appendMessage } from './conversation.js';
import { showNotification } from '../notificationHandler.js';
import { getCookie } from '../utils.js';
import { dbPromise } from './db.js';
import { setupCryptoForContact } from './DoubleRatchet/contactCrypto.js';
import {handleContactResponse} from './ContactStorage.js';

// Initialize socket connection with auth token
const socket = io('/', {
  extraHeaders: {
    'Authorization': `Bearer ${getCookie('access_token_cookie')}`
  }
});

/**
 * Setup all socket event handlers
 */
function setupSocketHandlers() {
  // Connection events
  setupConnectionEvents();

  // Message events
  setupMessageEvents();

  // Contact events
  setupContactEvents();

  console.debug('[WS] Socket handlers have been set up successfully');
}

/**
 * Setup connection-related socket events
 */
function setupConnectionEvents() {
  socket.on('connect', () => {
    console.debug('[WS] Connected with socket.id:', socket.id);
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
}

/**
 * Setup message-related socket events
 */
function setupMessageEvents() {
  socket.on('message', async (payload) => {
    console.debug('[WS] Received message event', payload);
    const {from, ciphertext, id} = payload;

    // Ignore messages not for current contact
    if (from !== window.currentContactEmail) {
      console.debug('[WS] Message is for another contact, ignoring');
      return;
    }

    // Display message
    appendMessage(ciphertext, 'incoming');

    // Store message in IndexedDB
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

    // Send delivery confirmation
    socket.emit('message_received', {
      messageId: id,
      sender: from
    });
  });

  socket.on('message_sent', async ({ id }) => {
    console.debug('[WS] Message sent with ID:', id);

    try {
      await updateSentMessageWithId(id);
    } catch (e) {
      console.error('[DB] Failed to update serverMessageId', e);
    }
  });

  socket.on('messages_load', async (data) => {
      console.debug('[WS] Received undelivered messages:', data);
      const messages = data.messages || [];

      const contactEmail = window.currentContactEmail;
      if (!contactEmail) return;

      const db = await dbPromise;
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');

      for (const msg of messages) {
        const { content, timestamp } = msg;

        // Simule réception immédiate
        appendMessage(content, 'incoming');

        store.add({
          serverMessageId: null,
          contactEmail: contactEmail,
          ciphertext: content,
          direction: 'incoming',
          timestamp: new Date(timestamp).getTime(),
          readFlag: false
        });
      }

      await tx.complete;
    });

    socket.on('mark_messages_as_read', ({ contact_email }) => {
      console.debug(`[WS] Messages marked as read for ${contact_email}`);
    });

}

/**
 * Update sent message with server ID
 * @param {string} id - Server message ID
 * @returns {Promise<void>}
 */
async function updateSentMessageWithId(id) {
  const db = await dbPromise;
  const tx = db.transaction('messages', 'readwrite');
  const store = tx.objectStore('messages');
  const idx = store.index('byContact');
  const range = IDBKeyRange.only(window.currentContactEmail);

  const recs = await new Promise((resolve, reject) => {
    const req = idx.getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const pending = recs.find(m =>
    m.direction === 'outgoing' && m.serverMessageId == null
  );

  if (pending) {
    pending.serverMessageId = id;
    store.put(pending);
  }

  return new Promise(resolve => { tx.oncomplete = resolve });
}

/**
 * Setup contact-related socket events
 */
function setupContactEvents() {
  socket.on('contact_request', (data) => {
    console.debug('[WS] Received contact request from:', data.from);
    loadPendingRequests();
    showNotification(`New contact request from ${data.from}`);
  });

  socket.on('contact_request_response', (data) => {
    console.debug('[WS] Contact request response:', data.from, "with status:", data.status);

    try {
      handleContactResponse(data.from, data.status)
    }
    catch (err) {
      console.error('[WS] Failed to handle contact response:', err);
    }

    if (data.status === 'accepted') {
      showNotification(`${data.from} accepted your contact request`);
      // No notification needed, contact will be added to list
    } else {
      showNotification(`${data.from} rejected your contact request`);
    }
  });
}

export { socket, setupSocketHandlers };