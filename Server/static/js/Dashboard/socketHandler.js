function setupMessageHandlers(socket) {
  // Listen for incoming messages
  socket.on('message', (payload) => {
    console.log('Received message:', payload);

    // Extract message data
    const { from, ciphertext, msg_type, id } = payload;

    // Display the message in the UI
    displayMessage(from, ciphertext, id);
  });

  // Listen for contacts list updates
  socket.on('contacts_list', (data) => {
    console.log('Received contacts:', data);
    updateContactsList(data.contacts);
  });

  // Handle sent message confirmations
  socket.on('message_sent', (data) => {
    console.log('Message sent with ID:', data.id);
    // You could update UI to show the message was sent
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
    // Display error notification
  });
}

// Function to display messages in the UI
function displayMessage(sender, encryptedContent, messageId) {
  // This implementation depends on your UI structure
  const messagesContainer = document.querySelector('.messages-list');
  const messageElement = document.createElement('div');
  messageElement.className = 'message-item' + (sender === currentUserEmail ? ' sent' : ' received');

  // You'll need to decrypt the message before displaying it
  // const decryptedContent = decryptMessage(encryptedContent);

  messageElement.innerHTML = `
    <div class="message-content">${encryptedContent}</div>
    <div class="message-sender">${sender}</div>
  `;
  messagesContainer.appendChild(messageElement);

  // Auto-scroll to the bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateContactsList(contacts) {
  const contactsList = document.querySelector('.contacts-list');

  // Clear existing contacts
  contactsList.innerHTML = '';

  // Add each contact
  contacts.forEach(contact => {
    const li = document.createElement('li');
    li.className = 'contact-item';
    li.dataset.contactEmail = contact.email;
    li.dataset.contactId = contact.id;
    li.innerHTML = `
      <span class="contact-name">${contact.email}</span>
      <span class="contact-remove">Remove</span>
    `;
    contactsList.appendChild(li);
  });
}