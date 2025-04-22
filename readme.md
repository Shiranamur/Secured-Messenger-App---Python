# 🛡️ Secured Messenger App

Ce projet académique a pour objectif la conception et le prototypage d’une application de messagerie instantanée sécurisée, implémentant un chiffrement bout en bout robuste en Python et JavaScript.

---
## Installation & déploiement

1. **Prérequis**

   - Python ≥ 3.12
   - MySQL ≥ 8 / MariaDB ≥ 10.6

2. **Configuration**

   Renommer `.env.example` → `.env` et adapter :
     ```env
     DB_URI=mysql://user:password@localhost:3306/secured_messenger
     SECRET_KEY=<clé secrète>
     JWT_SECRET_KEY=<clé JWT>
     PASSWORD_PEPPER=<pepper>
     ```

3. **Base de données**

   ```bash
   Get-Content Server\databases\userdb.sql | mysql -u root -p
   ```

4. **Environnement virtuel & dépendances**

   ```bash
   cd .\Secured-Messenger-App---Python\
   py -3 -m venv .venv
   .venv\Scripts\activate  
   pip install -r requirements.txt
   ```

5. **Lancement**

   ```bash
   flask --app Server.app run
   ```

---
## Organisation du projet

### Découpage des tâches

- **Analyse des besoins**  
  Recensement des exigences fonctionnelles et non-fonctionnelles (E2EE, authentification JWT, communication en temps réel, gestion des clés).


- **Conception**  
  Modélisation de l’architecture client-serveur, élaboration des diagrammes de séquence X3DH et de déploiement.


- **Implémentation backend**  
  - Développement de l'API REST (Flask, JWT, CSRF)  
  - Conception du schéma relationnel (MySQL/MariaDB)  


- **Implémentation frontend**  
  - Interface web en JavaScript (vanilla) et Socket.IO-client  
  - Interaction avec IndexedDB et LibSignal JS
  - Intégration du stockage local IndexedDB (DH Keys, contact, contact request, sessions, messages)


- **Cryptographie avancée**  
  - Recherche et intégration du protocole X3DH  
  - Mise en œuvre de l’algorithme Double Ratchet pour chaque message


- **Tests et validation**  
  Mise en place de tests d'intégration


- **Présentations et documentation**  
  Production du README détaillé, des slides pour l’oral et du tableau Kanban.

---

## Répartition & estimations

- Backend « classique » (API REST, schéma BD, chiffrement des mots de passe) : ~10 h‑Homme


- Frontend prototype non chiffré (interface JS, stockage IndexedDB initial) : ~10 h‑Homme


- Cryptographie X3DH & Double Ratchet : ~7 jours‑Homme


- Tests d'intégration, vérification du bon fonctionnement de l'application ~10 h‑Homme

**Répartition informelle :**

- Léo : gestion des contacts, livraison des messages via WebSocket, base de données initiale, tests et débogage.

- Antonio : implémentation back & front du protocole X3DH et intégration WebSocket.

- Ulysse : développement des routes API, sécurité (PBKDF2 + salt/pepper), JWT, CSRF, transmission des pré‑keys et signed_prekey, stockage local des messages.


![](https://github.com/Shiranamur/Secured-Messenger-App---Python/blob/main/Ressources/kanban_messenger_app.png)

---

## Choix technologiques

- **LibSignal JS**  
  Implémentation récente du protocole Signal, intégrée côté client pour X3DH, Double Ratchet, création de clés.


- **Flask + Flask-SocketIO**  
  API REST et WebSockets unifiés, support natif du WebSocket.


- **MySQL/MariaDB**  
  Base relationnelle pour métadonnées et clés publiques.


- **IndexedDB**  
  Persistance locale sécurisée des clés privées et des messages en transit.


- **JWT (Flask-JWT-Extended, Flask-WTF)**  
  Gestion des tokens d’accès et de rafraîchissement avec protection CSRF.

---

## Base de données relationnelle

## Modélisation des tables de la base `secured_messenger`

### Table `users`
Structure centrale pour la gestion des identités utilisateurs et de leurs clés cryptographiques.

| Champ                  | Type           | Description technique                                                   |
|------------------------|----------------|-------------------------------------------------------------------------|
| `id`                   | INT            | Identifiant primaire auto-incrémenté                                    |
| `email`                | VARCHAR(255)   | Adresse email unique de l'utilisateur                                  |
| `pwdhash`              | VARCHAR(255)   | Empreinte (hash) du mot de passe utilisateur                           |
| `salt`                 | VARCHAR(255)   | Valeur aléatoire pour le hachage du mot de passe                      |
| `identity_public_key`  | VARCHAR(255)   | Clé publique d'identité (utilisée dans le protocole X3DH)            |
| `signed_prekey`        | VARCHAR(255)   | Pré-clé signée, renouvelable périodiquement                       |
| `signed_prekey_signature` | VARCHAR(255) | Signature de la pré-clé par la clé d'identité                       |

---

### Table `contact_requests`
Modélise les requêtes de contact entre utilisateurs dans un système asymétrique.

| Champ         | Type       | Description technique                                               |
|---------------|------------|---------------------------------------------------------------------|
| `id`          | INT        | Identifiant unique de la requête                                   |
| `requester_id`| INT        | Référence à l'utilisateur initiateur de la demande                |
| `recipient_id`| INT        | Référence à l'utilisateur cible de la demande                    |
| `status`      | ENUM       | État de la requête : `pending`, `accepted`, `rejected`              |
| `created_at`  | TIMESTAMP  | Timestamp d'insertion, par défaut à l'heure système               |

⚿ Contrainte d'intégrité : couple unique `(requester_id, recipient_id)`

---

### Table `prekeys`
Permet la gestion des pré-clés (clés jetables) utilisées dans le protocole X3DH.

| Champ       | Type          | Description technique                                      |
|-------------|---------------|------------------------------------------------------------|
| `id`        | INT           | Identifiant unique de la pré-clé                          |
| `user_id`   | INT           | Référence à l'utilisateur propriétaire                   |
| `prekey_id` | INT           | Identifiant local de la pré-clé pour traçabilité            |
| `prekey`    | VARCHAR(255)  | Valeur de la clé pré-distribuée                             |
| `used`      | BOOLEAN       | Indicateur booléen si la pré-clé a déjà été consommée      |

---

### Table `messages`
Contient les messages échangés entre utilisateurs avec leurs métadonnées.

| Champ           | Type           | Description technique                                     |
|-----------------|----------------|-----------------------------------------------------------|
| `id`            | INT            | Identifiant unique du message                             |
| `sender_email`  | VARCHAR(255)   | Email de l'expéditeur                                     |
| `receiver_email`| VARCHAR(255)   | Email du destinataire                                     |
| `content`       | TEXT           | Contenu textuel du message (potentiellement chiffré)       |
| `timestamp`     | TIMESTAMP      | Horodatage de l'envoi                                     |
| `is_delivered`  | BOOLEAN        | Message remis au destinataire ?                           |
| `is_read`       | BOOLEAN        | Message consulté par le destinataire ?                    |

---

### Table `x3dh_params`
Stocke les paramètres d'établissement initial de session via le protocole X3DH.

| Champ             | Type           | Description technique                                                |
|-------------------|----------------|----------------------------------------------------------------------|
| `id`              | INT            | Identifiant de la transaction X3DH                                   |
| `sender_email`    | VARCHAR(255)   | Expéditeur de la requête X3DH                                       |
| `recipient_email` | VARCHAR(255)   | Destinataire de la session X3DH                                      |
| `ephemeral_key`   | VARCHAR(255)   | Clé éphémère générée par l'expéditeur                              |
| `prekey_id`       | INT            | Identifiant de la pré-clé du destinataire                         |
| `signed_prekey`   | VARCHAR(255)   | Pré-clé signée du destinataire                                    |
| `created_at`      | TIMESTAMP      | Timestamp d'émission du paquet X3DH                               |

⚿ Contrainte d'intégrité : unique `(sender_email, recipient_email)`



---

## Stockage local (IndexedDB)

**Base :** `SecureMessengerDB`

**Stores :**
- `messages`  
  `{ contactEmail, content, direction, timestamp, read }`
- `contactRequests`  
  Requêtes en attente
- `contacts`  
  Liste des contacts approuvés
- `signalKeys`  
  Clés privée/publique de l’utilisateur
- `signalSessions`  
  Données de session Double Ratchet (rootKey, chain keys, counters, alt user signed prekey)

---

## Sécurité et chiffrement

- **Gestion des mots de passe**  
  PBKDF2‑HMAC‑SHA256, salt unique + pepper (variable d’environnement).


- **Authentification**  
  JWT stockés en cookies HTTPOnly, rotation des tokens, protection CSRF.


- **Chiffrement E2EE**  
  - Protocole X3DH pour l’établissement de la session initiale  
  - Algorithme Double Ratchet pour confidentialité persistante et forward secrecy


- **Sécurité WebSocket**  
  Authentification lors de la connexion Socket.IO, renégociation périodique des clés.


- **Contre‑attaques**  
  Salt + pepper pour contrer les rainbow tables, validation stricte des entrées, gestion des erreurs.

---

## API REST

| Route                                    | Méthode | Payload                                        | Succès (code & réponse)                                                                                  | Erreurs principales (code)                 |
| ---------------------------------------- | ------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |--------------------------------------------|
| `/api/x3dh_params/ephemeral/send`        | POST    | `{ recipient_email, ephemeral_key, prekey_id, our_signed_prekey }` | **200** `{ "status": "success" }`                                                                          | 400 paramètres manquants<br>500 erreur BD  |
| `/api/x3dh_params/ephemeral/retrieve`    | POST    | `{ sender_email }`                              | **200** `{ "status": "success", "ephemeral_key": string, "prekey_id": number }`                            | 400 paramètre manquant<br>500 erreur BD    |
| `/api/identity_key`                      | POST    | `{ email }`                                     | **200** `{ "identity_key": string }`                                                                       | 400 paramètre manquant<br>500 erreur BD    |
| `/api/keys`                              | POST    | `{ contact_email }`                             | **200** `{ identity_public_key, signed_prekey, signed_prekey_signature, one_time_prekey }`                 | 400 paramètre manquantr<br>500 erreur BD   |
| `/api/contact-requests`                  | GET     | —                                               | **200** `{ "requests": [ { id, requester_email, created_at }, … ] }`                                       | —                                          |
| `/api/contact-requests/<request_id>`     | PUT     | `{ action }` où action ∈ ["accept","reject"]     | **200** `{ "status": "success", "message": "Request accepted/rejected" }`                                  | 400 action invalide<br>                    |
| `/api/prekeys/count`                     | GET     | —                                               | **200** `{ "count": <nombre_de_prekeys_non_utilisées> }`                                                  | —                                          |
| `/api/refreshpks`                        | POST    | `{ prekeys: [ { prekey_id, prekey }, … ] }`     | **201** `{ "status": "success", "message": "prekeys refreshed" }`                                          | 400 payload invalide                       |
| `/api/contact` (envoi)                   | POST    | Form `user2` (email de l’utilisateur à ajouter) | **200** `{ "status": "success", "message": "Contact request sent successfully", "userEmail": string }`    | 404 utilisateur inexistant<br>409 self-add |
| `/api/contact` (suppression)             | DELETE  | Form `emailToRemove` (email à supprimer)        | **200** `{ "status": "success", "message": "Contact removed successfully", "userEmail": string }`         | 404 utilisateur inexistant                 |
| `/login`                                 | POST    | Form `email, password`                          | **302** Redirect vers `/home/dashboard` + Set-Cookie: access_token                                         | 401 Mot de passe ou email invalide         |
| `/register`                              | POST    | Form `email, password, identity public key, signed prekey, signed prekey signature, prekeys` | **302** Redirect vers `/` & flash message "Registration successful"                         | 400 Validation errors & redirect vers `/`  |

---

## Tests et couverture

> **Lien du document du protocole de test :**
- https://docs.google.com/document/d/1_qAldB3DrKoBx5TS8RhgWnkrahKZ2Cssscilyy2_WJk/edit?usp=sharing

---

## Fonctionnalité additionnelle

**Fonctionnalité additionnelle : Double Ratchet (3DH)**

- Forward Secrecy – Chaque message utilise une clé éphémère renouvelée : en cas de compromission ultérieure, les échanges précédents restent inaccessibles.

- Post‑Compromise Security – Si une clé est volée, le ratchet restaure automatiquement la confidentialité dès l’envoi suivant, limitant la fenêtre d’exposition.

- Choix du 3DH vs 4DH – Plus simple à implémenter et à auditer, couvre tous les cas d’usage (initiation, asynchrone, reconnexion) sans retarder le projet.

- Compatibilité WebSocket – Les messages restent chiffrés en base et, à la reconnexion, sont traités dans l’ordre des ratchets pour garantir intégrité et confidentialité quel que soit l’état de connexion.

---
