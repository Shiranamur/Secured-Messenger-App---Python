// Server/static/js/Dashboard/socketHandlers.js
import { loadPendingRequests } from './contacts.js';
import { appendMessage } from './conversation.js';
import { showNotification } from '../notificationHandler.js';
import { getCookie } from '../utils.js';
import { dbPromise } from './db.js';
import { handleContactResponse } from './ContactStorage.js';
import {getSessionByContact, saveSession} from "./DoubleRatchet/sessionStorage.js";
import { performX3DHasRecipient } from "./DoubleRatchet/contactCrypto.js";
import {arrayBufferToBase64, base64ToArrayBuffer, deletePreKey, getPreKey, loadKeyMaterial} from "../KeyStorage.js";
import {Session} from "./DoubleRatchet/session.js";

// Initialize socket connection with auth token
const socket = io('/', {
  extraHeaders: { 'Authorization': `Bearer ${getCookie('access_token_cookie')}` }
});

// to store pending messages until the session is initialized
let pending = [];
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

  socket.on('ephemeral_key', async ({from, ephemeral_key, prekey_id}) => {
    // decode and derive X3DH secret
    const theirRatchetKey = base64ToArrayBuffer(ephemeral_key);

    // load our keys…
    const ourKeyMaterial = await loadKeyMaterial();
    const oneTimePreKey = await getPreKey(prekey_id);

    // derive the secret
    const sharedSecret = await performX3DHasRecipient(
        ourKeyMaterial,
        from,
        theirRatchetKey,
        oneTimePreKey
    );

    // one-shot responder init
    const session = new Session(from);
    await session.initializeAsResponder(sharedSecret, theirRatchetKey);
    await deletePreKey(prekey_id);
    await saveSession(session);

    console.log('[WS] Emitting ratchet response to:', from);
    // send back our ephemeral
    socket.emit('ratchet_response', {
      to: from,
      ratchet_key: arrayBufferToBase64(session.DHs.pubKey)
    });

    // replay any pending inbound messages
    pending.forEach(handleMessage);
    pending = [];
  });
}

/**
 * Setup message-related socket events
 */
function setupMessageEvents() {
  // todo messages !

  // generic message handler
socket.on('message', async (msg) => {
  try {
    // 1) load or create the live session object
    const session = await getSessionByContact(msg.from);

    // 2) decrypt the ciphertext
    const text = await session.decrypt(msg.ciphertext);

    // 3) persist the mutated session (so we don’t ratchet twice)
    await saveSession(session);

    // 4) show / store the plaintext
    appendMessage(text, 'incoming');
    // … optionally send delivery receipt …
  } catch (err) {
    console.error('[WS] Failed to decrypt incoming message:', err);
  }
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
      handleContactResponse(data.from, data.status, 'requesting')
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


async function handleMessage(msg, session) {
  const { header, ciphertext, iv, mac } = msg.ciphertext;
  try {
    const text = await session.decrypt({ header, ciphertext, iv, mac });
    appendMessage(text, 'incoming');

    // Store message in IndexedDB
    try {
      const db = await dbPromise;
      const tx = db.transaction('messages', 'readwrite');
      tx.objectStore('messages').add({
        serverMessageId: msg.id,
        contactEmail: msg.from,
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
      messageId: msg.id,
      sender: msg.from
    });
  } catch (err) {
    console.warn('Failed to decrypt incoming message:', err);
  }
}

export { socket, setupSocketHandlers };