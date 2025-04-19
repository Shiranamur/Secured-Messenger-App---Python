const conversationArea = document.getElementById('conversation-area');

async function loadConversation(contactEmail) {
    console.debug('[CONVO] Loading history for', contactEmail);
    try {
        const r = await fetch(`/api/messages/${contactEmail}`);
        console.debug('[CONVO] GET /api/messages status', r.status);
        const js = await r.json();
        conversationArea.innerHTML = '';

        if (!js.length) {
            console.debug('[CONVO] No messages yet');
            conversationArea.innerHTML = '<p>No messages yet</p>';
            return;
        }

        console.debug('[CONVO] Rendering', js.length, 'messages');
        js.forEach(m =>
            appendMessage(
                m.ciphertext,
                m.sender_email === contactEmail ? 'incoming' : 'outgoing'
            )
        );
    } catch (err) {
        console.error('[CONVO] Error fetching conversation:', err);
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