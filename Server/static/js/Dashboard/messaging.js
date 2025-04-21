// Server/static/js/Dashboard/messaging.js
import { socket } from './socketHandlers.js';
import { appendMessage } from './conversation.js';
import { saveMessage } from './db.js';

/**
 * Send a message via WebSocket
 * @returns {Promise<void>}
 */
async function sendMessageViaSocket() {
  // Check if a contact is selected
  if (!window.currentContactEmail) {
    console.warn('[MSG] No contact selected');
    return;
  }

  // Get message text
  const newMsgInput = document.getElementById('new-message');
  const plaintext = newMsgInput.value.trim();
  if (!plaintext) {
    console.warn('[MSG] Empty input, nothing sent');
    return;
  }

  try {
    // Sanitize message text
    const tempDiv = document.createElement('div');
    tempDiv.textContent = plaintext;
    const sanitizedText = tempDiv.textContent;

    // Send message via socket
    console.debug('[MSG] Sending message to', window.currentContactEmail);
    socket.emit('send_message', {
      receiver: window.currentContactEmail,
      ciphertext: sanitizedText,
      msg_type: 'message'
    });

    // Save message to local storage
    await saveMessage({
      contactEmail: window.currentContactEmail,
      ciphertext: sanitizedText,
      direction: 'outgoing',
      timestamp: Date.now()
    });

    // Display message in conversation
    appendMessage(sanitizedText, 'outgoing');

    // Clear input
    newMsgInput.value = '';

  } catch (error) {
    console.error('[MSG] Error sending message:', error);
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