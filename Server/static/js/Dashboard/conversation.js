import { dbPromise } from './db.js';

const conversationArea = document.getElementById('conversation-area');

async function loadConversation(contactEmail) {
  console.debug('[CONVO] Loading', contactEmail);
  conversationArea.innerHTML = '';

  try {
    const db    = await dbPromise;
    const tx    = db.transaction('messages', 'readonly');
    const idx   = tx.objectStore('messages').index('byContact');
    const range = IDBKeyRange.only(contactEmail);

    const all = await new Promise((resolve, reject) => {
      const req = idx.getAll(range);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });

    if (!all.length) {
      conversationArea.innerHTML = '<p>No messages yet</p>';
    } else {
      all
        .sort((a, b) => a.timestamp - b.timestamp)
        .forEach(m => appendMessage(m.ciphertext, m.direction));
    }

    await new Promise(res => { tx.oncomplete = res; });

  } catch (e) {
    console.error('[DB] failed to load conversation', e);
  }
}

function appendMessage(blob, kind) {
    const plaintext = atob(blob); // TODO: decrypt if needed
    const el = document.createElement('div');
    el.className = `message ${kind}`;
    el.textContent = plaintext;
    conversationArea.appendChild(el);
    conversationArea.scrollTop = conversationArea.scrollHeight;
    console.debug('[MSG] Appended', kind, 'message:', plaintext.slice(0, 50));
}

export { loadConversation, appendMessage };