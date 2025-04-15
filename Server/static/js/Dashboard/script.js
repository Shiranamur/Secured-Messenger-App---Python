// AJAX for loading conversations

document.querySelectorAll('.contact-item').forEach(contact => {
    contact.addEventListener('click', function() {
        const contactId = this.dataset.contactId;

        // Highlight selected contact
        document.querySelectorAll('.contact-item').forEach(c => {
            c.classList.remove('selected');
        });
        this.classList.add('selected');

        // Show message input
        document.getElementById('message-input').style.display = 'flex';

        // Fetch conversations for this contact
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
    });
});

document.querySelectorAll('.contact-remove').forEach(remove => {
    remove.addEventListener('click', function(e) {
        console.log("Remove contact clicked");
        e.stopPropagation(); // Prevent triggering the parent's click event
        const contactId = this.parentElement.dataset.contactId;
        const currentUserId = document.querySelector('input[name="user1"]').value;

        // Send a request to remove the contact
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
                this.parentElement.remove();
            } else {
                console.error(data.message);
            }
        })
        .catch(error => {
            console.error('Error removing contact:', error);
        });
    });
});

// Prevent default form submission and post using Fetch API
document.getElementById('add-contact-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const formData = new FormData(this);

    try {
        const response = await fetch(this.action, { method: 'POST', body: formData });
        const data = await response.json();

        if (data.status === 'success') {
            console.log('Contact added successfully:', data);
            // Update your contacts DOM; for example, append a new contact list item
            const contactsList = document.querySelector('.contacts-list');
            // Add logic to create and append the new contact item using data from the response
            const newContact = document.createElement('li');
            newContact.className = 'contact-item';
            // Set data attributes as needed. Replace 'id' and 'email' below based on your response content
            newContact.dataset.contactId = formData.get('user2');
            newContact.textContent = "New Contact Added";
            contactsList.appendChild(newContact);
        } else {
            console.error(data.message);
        }
    } catch (error) {
        console.error('Error adding contact:', error);
    }
});