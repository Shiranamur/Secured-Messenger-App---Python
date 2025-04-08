CREATE DATABASE userdb;

USE userdb;

CREATE TABLE users (
    id INT AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE,
    pwdhash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    identity_public_key VARCHAR(255) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE devices (
    id INT AUTO_INCREMENT,
    user_id INT,
    new_global_public_key VARCHAR(255),
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
