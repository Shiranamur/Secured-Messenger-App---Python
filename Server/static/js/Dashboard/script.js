// Dashboard interactions for messaging app
document.addEventListener('DOMContentLoaded', () => {
    initializeExistingContacts();
    initializeAddContactForm();
});

// Functions for handling conversation display
function loadConversation(contactId) {
    fetch(`/api/conversations/${contactId}`)
        .then(response => response.json())
        .then(messages => {
            const conversationArea = document.getElementById('conversation-area');
            conversationArea.innerHTML = '';

            if (messages.length === 0) {
                conversationArea.innerHTML = '<p>No messages yet</p>';
                return;
            }

            messages.forEach(message => {
                const msgElement = document.createElement('div');
                msgElement.className = 'message';
                msgElement.textContent = message.content;
                conversationArea.appendChild(msgElement);
            });
        })
        .catch(error => {
            console.error('Error fetching conversations:', error);
        });
}

// Functions for contact management
function selectContact(contactElement) {
    // Highlight selected contact
    document.querySelectorAll('.contact-item').forEach(c => {
        c.classList.remove('selected');
    });
    contactElement.classList.add('selected');

    // Show message input
    document.getElementById('message-input').style.display = 'flex';

    // Load conversation for selected contact
    const contactId = contactElement.dataset.contactId;
    loadConversation(contactId);
}

function removeContact(contactElement, e) {
    e.stopPropagation(); // Prevent triggering the parent's click event
    const contactId = contactElement.parentElement.dataset.contactId;
    const currentUserId = document.querySelector('input[name="user1"]').value;

    const formData = new FormData();
    formData.append('user1', currentUserId);
    formData.append('user2', contactId);

    fetch(`/api/contact`, {
        method: 'DELETE',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            contactElement.parentElement.remove();
        } else {
            console.error(data.message);
        }
    })
    .catch(error => {
        console.error('Error removing contact:', error);
    });
}

function createContactElement(contactId, contactEmail) {
    // Create the contact HTML structure
    const newContact = document.createElement('li');
    newContact.className = 'contact-item';
    newContact.dataset.contactId = contactId;

    // Create the contact name span
    const nameSpan = document.createElement('span');
    nameSpan.className = 'contact-name';
    nameSpan.textContent = contactEmail;

    // Create the remove button span
    const removeSpan = document.createElement('span');
    removeSpan.className = 'contact-remove';
    removeSpan.textContent = 'Remove';

    // Add the spans to the contact item
    newContact.appendChild(nameSpan);
    newContact.appendChild(removeSpan);

    // Add event listeners
    newContact.addEventListener('click', function() {
        selectContact(this);
    });

    removeSpan.addEventListener('click', function(e) {
        removeContact(this, e);
    });

    return newContact;
}

// Initialize existing elements
function initializeExistingContacts() {
    document.querySelectorAll('.contact-item').forEach(contact => {
        contact.addEventListener('click', function() {
            selectContact(this);
        });
    });

    document.querySelectorAll('.contact-remove').forEach(removeBtn => {
        removeBtn.addEventListener('click', function(e) {
            removeContact(this, e);
        });
    });
}

// Initialize the add contact form
function initializeAddContactForm() {
    document.getElementById('add-contact-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);

        try {
            const response = await fetch(this.action, { method: 'POST', body: formData });
            const data = await response.json();

            if (data.status === 'success') {
                console.log('Contact added successfully:', data);

                // Get the contact details from the response
                const contactId = data.contact.user2.id;
                const contactEmail = data.contact.user2.email;

                // Create and append the new contact element
                const newContact = createContactElement(contactId, contactEmail);
                document.querySelector('.contacts-list').appendChild(newContact);
            } else {
                console.error(data.message);
            }
        } catch (error) {
            console.error('Error adding contact:', error);
        }
    });
}