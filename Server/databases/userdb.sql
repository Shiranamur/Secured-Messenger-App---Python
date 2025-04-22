CREATE DATABASE userdb;

USE userdb;

CREATE TABLE users (
    id INT AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE,
    pwdhash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    identity_public_key VARCHAR(255) NOT NULL,
    signed_prekey VARCHAR(255) NOT NULL,
    signed_prekey_signature VARCHAR(255) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE contact_requests
(
    id INT AUTO_INCREMENT PRIMARY KEY,
    requester_id INT NOT NULL,
    recipient_id INT NOT NULL,
    status ENUM ('pending', 'accepted', 'rejected') DEFAULT 'pending',
    created_at   TIMESTAMP                                DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES users (id),
    FOREIGN KEY (recipient_id) REFERENCES users (id),
    UNIQUE KEY unique_request (requester_id, recipient_id)
);

CREATE TABLE prekeys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    prekey_id INT NOT NULL,
    prekey VARCHAR(255) NOT NULL,
    used BOOLEAN NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_email varchar(255) NOT NULL,
    receiver_email varchar(255) NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_delivered BOOLEAN DEFAULT FALSE,
    is_read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (sender_email) REFERENCES users(email),
    FOREIGN KEY (receiver_email) REFERENCES users(email)
);

CREATE TABLE x3dh_params (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_email VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    ephemeral_key VARCHAR(255) NOT NULL,
    prekey_id INT NOT NULL,
    signed_prekey VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_email) REFERENCES users(email),
    FOREIGN KEY (recipient_email) REFERENCES users(email),
    UNIQUE KEY unique_request (sender_email, recipient_email)
);