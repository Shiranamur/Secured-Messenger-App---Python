// Server/static/js/Dashboard/conversation.js
import { dbPromise } from './db.js';
import { socket } from './socketHandlers.js';


const conversationArea = document.getElementById('conversation-area');

/**
 * Load conversation with a contact
 * @param {string} contactEmail - Email of the contact
 * @returns {Promise<void>}
 */
async function loadConversation(contactEmail) {
  console.debug('[CONVO] Loading', contactEmail);
  conversationArea.innerHTML = '';

  try {
    // Get the messages for this contact
    const db = await dbPromise;
    const tx = db.transaction('messages', 'readonly');
    const idx = tx.objectStore('messages').index('byContact');
    const range = IDBKeyRange.only(contactEmail);

    const messages = await new Promise((resolve, reject) => {
      const req = idx.getAll(range);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // Display messages or empty state
    if (!messages.length) {
      conversationArea.innerHTML = '<p class="empty-state">No messages yet</p>';
    } else {
      // Sort messages by timestamp and display them
      messages
        .sort((a, b) => a.timestamp - b.timestamp)
        .forEach(m => appendMessage(m.ciphertext, m.direction));
    }

    // Wait for transaction to complete
    await new Promise(resolve => { tx.oncomplete = resolve; });

    socket.emit('load_undelivered_messages', {
      contact_email: contactEmail
    });

    socket.emit('mark_messages_as_read', {
      contact_email: contactEmail
    });

  } catch (error) {
    console.error('[DB] Failed to load conversation:', error);
    conversationArea.innerHTML = '<p class="error-state">Failed to load messages</p>';
  }
}


/**
 * Append a message to the conversation area
 * @param {string} plaintext - Text content of the message
 * @param {string} kind - Direction of message ('incoming' or 'outgoing')
 */
function appendMessage(plaintext, kind) {
  // Create message element
  const el = document.createElement('div');
  el.className = `message ${kind}`;

  // Set content and sanitize if needed
  const tempDiv = document.createElement('div');
  tempDiv.textContent = plaintext;
  el.textContent = tempDiv.textContent;

  // Add to conversation and scroll to bottom
  conversationArea.appendChild(el);
  conversationArea.scrollTop = conversationArea.scrollHeight;

  console.debug('[MSG] Appended', kind, 'message:',
    plaintext.length > 50 ? plaintext.slice(0, 50) + '...' : plaintext);
}

/**
 * Mark all messages from a contact as read
 * @param {string} contactEmail - Email of the contact
 * @returns {Promise<void>}
 */
async function markConversationAsRead(contactEmail) {
  try {
    const db = await dbPromise;
    const tx = db.transaction('messages', 'readwrite');
    const idx = tx.objectStore('messages').index('byContact');
    const range = IDBKeyRange.only(contactEmail);

    const messages = await new Promise((resolve, reject) => {
      const req = idx.getAll(range);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // Find unread messages and mark them as read
    const unreadMessages = messages.filter(m => !m.readFlag);
    const store = tx.objectStore('messages');

    for (const msg of unreadMessages) {
      msg.readFlag = true;
      store.put(msg);
    }

    await new Promise(resolve => { tx.oncomplete = resolve; });

  } catch (error) {
    console.error('[DB] Failed to mark messages as read:', error);
  }
}

export { loadConversation, appendMessage, markConversationAsRead };