// Server/static/js/Dashboard/messaging.js
import { socket } from './socketHandlers.js';
import { appendMessage } from './conversation.js';
import { saveMessage } from './db.js';
import {getSessionByContact, saveSession} from "./DoubleRatchet/sessionStorage.js";

/**
 * Send a message via WebSocket
 * @returns {Promise<void>}
 */
async function sendMessageViaSocket() {
  if (!window.currentContactEmail) {
    console.warn('[MSG] No contact selected');
    return;
  }

  const input = document.getElementById('new-message');
  const plaintext = input.value.trim();
  if (!plaintext) {
    console.warn('[MSG] Empty input, nothing sent');
    return;
  }

  try {
    // 1) Load your live session
    const session = await getSessionByContact(window.currentContactEmail);
    if (!session) {
      console.warn('[MSG] No session for', window.currentContactEmail);
      return;
    }

    // 2) Encrypt the clean plaintext
    const safeText = (() => {
      const d = document.createElement('div');
      d.textContent = plaintext;
      return d.textContent;
    })();
    const ciphertext = await session.encrypt(safeText);

    // 3) Persist the ratchet state so CKs/Ns advance
    await saveSession(session);

    // 4) Send to the server
    socket.emit('send_message', {
      receiver:  window.currentContactEmail,
      ciphertext,
      msg_type:  'message'
    });

    // 5) Store the plaintext locally (so you can always display it,
    //    even if you lose your keys and can’t decrypt later)
    await saveMessage({
      contactEmail: window.currentContactEmail,
      plaintext:    safeText,     // <-- store the clear‑text
      direction:    'outgoing',
      timestamp:    Date.now()
    });

    // 6) Show it in the UI
    appendMessage(safeText, 'outgoing');
    input.value = '';

  } catch (err) {
    console.error('[MSG] Error sending message:', err);
  }
}

/**
 * Set up message sending functionality
 */
function setupSendMessage() {
  const sendButton = document.getElementById('send-message');
  const msgInput = document.getElementById('new-message');

  if (sendButton) {
    sendButton.addEventListener('click', sendMessageViaSocket);
  }

  if (msgInput) {
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessageViaSocket();
    });
  }
}

export { setupSendMessage, sendMessageViaSocket };