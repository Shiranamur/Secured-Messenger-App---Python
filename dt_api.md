# server
send_messages

    Parsing : Extraire et valider les adresses e-mail de l'expéditeur (sender_email) et du destinataire (receiver_email).
    Base de Données Redis : Ajouter le message à une liste de messages non délivrés. Le message doit être stocké sous forme de JSON avec les champs suivants :
        timestamp : Horodatage du message.
        sender_email : Adresse e-mail de l'expéditeur.
        new_ratchet_public_key : Nouvelle clé publique pour le chiffrement.
    Sécurité : Assurer que les données sont correctement validées et sécurisées avant d'être stockées.
    Gestion des Erreurs : Retourner des messages d'erreur appropriés en cas de problème de validation ou de stockage.

Connexion

    Validation : Valider les informations de connexion fournies par l'utilisateur.
    Redirection : Rediriger vers la route home si la connexion est valide.
    Script de Vérification : Démarrer un script pour vérifier s'il y a des messages à distribuer dans la base de données Redis.
    Long Polling : Initier une requête de long polling pour vérifier périodiquement la présence de nouveaux messages.
        Note : Le long polling peut être implémenté comme une route séparée ou intégré dans la logique de connexion selon l'architecture choisie.

home

    Affichage : Afficher les informations pertinentes pour l'utilisateur une fois connecté.
    Sécurité : Assurer que seules les informations autorisées sont accessibles.
    Interactivité : Permettre l'interaction avec d'autres fonctionnalités de l'application (ex. : envoi de messages, ajout de contacts).

Add Contact

    Requête SQL : Effectuer une requête vers la base de données relationnelle pour récupérer les informations de l'utilisateur.
    Échange de Clés : Mettre en place un mécanisme pour échanger les clés publiques entre utilisateurs.
    Validation : Valider les informations récupérées et s'assurer que l'échange de clés est sécurisé.
    Gestion des Erreurs : Retourner des messages d'erreur appropriés en cas de problème lors de la récupération des informations ou de l'échange de clés.

# CLient

Pages

    Connexion / inscruption
    Home

Scripts 

    Connexion
    Inscription
    Double Ratchet Script
    KDF script + random parameter generation
    Shared secret script
    RSA Script
    Send Script
    Recieve script
    Add Contact
    Long Polling
    Search user
    Load Message
    Register message