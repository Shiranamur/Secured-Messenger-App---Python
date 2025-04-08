const dbName = "MessagesDB";
const storeName = "messages";
let db;

// Open (or create) the IndexedDB database
function openDatabase() {
    const request = indexedDB.open(dbName, 1);

    request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.errorCode);
    };

        // Create the object store if this is the first time opening the DB
    request.onupgradeneeded = (event) => {
        db = event.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { autoIncrement: true });
        }
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        console.log("IndexedDB opened successfully");
        displayMessages();
    };
}

    // Store a message in the IndexedDB
function storeMessage(message) {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    // Create a record with message text and timestamp
    const messageRecord = {
        text: message,
        timestamp: Date.now()
    };
    const request = store.add(messageRecord);
    request.onsuccess = () => {
        console.log("Message stored:", messageRecord);
        displayMessages(); // refresh the list
    };

    request.onerror = (event) => {
        console.error("Error storing message:", event.target.error);
    };
}

    // Retrieve and display all messages from the IndexedDB
function displayMessages() {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const messagesList = document.getElementById("messagesList");
    messagesList.innerHTML = "";  // clear the list

    // Use a cursor to iterate over all messages
    store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const { text, timestamp } = cursor.value;
            const listItem = document.createElement("li");
            listItem.textContent = `(${new Date(timestamp).toLocaleString()}): ${text}`;
            messagesList.appendChild(listItem);
            cursor.continue();
        }
    };
}

// Initialize the database when the page loads
window.addEventListener("load", openDatabase);

// Bind store button to save a message
document.getElementById("storeBtn").addEventListener("click", () => {
    const messageInput = document.getElementById("messageInput");
    const message = messageInput.value.trim();
    if (message) {
        storeMessage(message);
        messageInput.value = ""; // clear input field after storing
    } else {
        alert("Please enter a message.");
    }
});