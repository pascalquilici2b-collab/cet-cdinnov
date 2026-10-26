# Outlook dans CDInnov — faisabilité

Étude et interface de rédaction CDI du 26 octobre 2026.

La fenêtre officielle Outlook Web ne peut pas être affichée à l’intérieur de l’application : Microsoft indique explicitement que le lien `webLink` d’un message n’est pas accessible dans une iframe. L’authentification interactive Microsoft impose également une fenêtre distincte. [Documentation du message Outlook](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0), [Restrictions d’authentification dans une iframe](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/iframe-usage).

La rédaction CDI permet désormais l’envoi direct par le compte Outlook du collaborateur. Un bouton secondaire conserve la création du brouillon dans Outlook et le téléchargement du message .eml. La confirmation manuelle est réservée à ce second parcours.

Une interface de rédaction entièrement dans CDInnov est techniquement possible avec Microsoft Graph, mais il s’agit d’une interface CDInnov, pas de la fenêtre Outlook. L’envoi direct nécessite une autorisation déléguée `Mail.Send` par utilisateur, une confirmation avant envoi et un traitement des échecs. Le pilote isolé a été testé avec succès par l’utilisateur. À sa demande, le parcours a ensuite été étendu aux factures et devis, avec la permission déléguée du compte connecté. Le droit de rédaction de brouillons suffit toujours au bouton secondaire. [Créer un brouillon](https://learn.microsoft.com/en-us/graph/api/user-post-messages?view=graph-rest-1.0), [Envoyer un message](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0).

## Essai de rédaction CDI ajouté le 26 octobre

Dans Facturation → Paramètres → Tester la rédaction CDI : message éditable, PDF de démonstration et pièces jointes amovibles, relecture puis confirmation. Cet essai envoie exclusivement vers la propre adresse de la session ; aucun destinataire client, copie ni changement de statut d’une facture. Le parcours existant des factures et devis reste disponible séparément.

L’autorisation déléguée Mail.Send est demandée uniquement lorsque la personne clique sur « Activer l’envoi Outlook ». Chaque personne utilise son compte, sans permission d’application ni accès global aux boîtes. Aucun consentement administrateur global n’est accordé. Les jetons restent dans la session du navigateur ; seuls les identifiants opaques du suivi de l’essai sont conservés localement.

Le message est créé en brouillon avec ses pièces, relu pour vérifier son contenu, puis envoyé par Graph après confirmation. Un identifiant immuable permet de contrôler sa présence dans les éléments envoyés. La réponse HTTP 202 signifie prise en charge, pas réception chez le destinataire. Un résultat incertain est vérifié sans renvoyer le message. [Envoi d’un brouillon](https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0), [Suivi par identifiant immuable](https://learn.microsoft.com/en-us/graph/outlook-immutable-id), [Consentement incrémental](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/resources-and-scopes).

Tests automatisés sur Graph simulé : comptes distincts, contrôle de la session, refus des destinataires tiers, copies et brouillons modifiés ; refus d’autorisation et perte de réponse sans double envoi. Interface vérifiée en clair, sombre et mobile. L’utilisateur a confirmé le bon fonctionnement du test réel. Aucun message supplémentaire n’est envoyé par les tests automatisés.

Pour les pièces volumineuses, le parcours actuel propose le fichier de message `.eml` avec ses pièces jointes ; le dépôt Graph direct reste limité à un total inférieur à 3 Mo, afin de créer le brouillon et ses pièces en une seule opération. Un envoi de fichiers plus volumineux via Graph demanderait des sessions de téléversement et leur suivi.

## Rédaction des factures et devis

Destinataires multiples À/Cc/Cci ; cdi@cdinnov.com reste prérempli en Cc pour les factures. Signature texte et image PNG/JPEG mémorisée par compte dans billing_mail_signatures (versionnée pour éviter les écrasements concurrents). Image jointe en ligne par Content-ID, contenu texte échappé. Pièces complémentaires et relevé amovibles, certificat Chorus conditionnel. Aperçu des destinataires avant confirmation.

Après l’envoi direct, le serveur vérifie le compte Microsoft, le message envoyé et son rattachement à la version du document. Le jeton Graph lui est transmis uniquement pour cette lecture, sans persistance ni journalisation. L’historique conserve l’identifiant du message. Le devis reçoit un événement envoyé sans écraser une acceptation existante. Une prise en charge 202 ou une panne réseau ne suffisent pas : le statut est synchronisé après confirmation effective dans Outlook. La réception par le client n’est pas garantie par ce statut.

Un verrou entre onglets et un suivi local par compte/document/version empêchent le renvoi involontaire après une réponse perdue. Le bouton de vérification ne renvoie jamais le message. La signature ne s’applique qu’au compte connecté. Les autres collaborateurs autorisent leur propre connexion Microsoft.

Validation : TypeScript ; 12 tests des brouillons/envois/recipients/signatures/MIME ; parcours historique Outlook ; test de l’interface avec le vrai Worker/D1 isolé et Graph simulé (envoi facture, preuve serveur, devis envoyé, idempotence, signature par compte, clair/sombre/mobile). Aucun message client réel, statut métier ou document de production modifié pendant ces tests.

## Contacts et signatures personnelles

La rédaction propose d’abord les contacts de la fiche client liée (ou une correspondance unique pour les anciens documents). La sélection ajoute ou retire des destinataires sans écraser les adresses saisies. Avec des contacts disponibles, aucune adresse générale n’est sélectionnée implicitement. Sans contact, l’adresse de la fiche reste préremplie. Cc et Cci restent éditables. Le chargement des contacts ne dépend plus du rendu PDF.

Microsoft Graph ne documente pas de propriété ni de méthode permettant de lire les signatures Outlook ; mailboxSettings ne les expose pas. Source consultée le 26 octobre 2026 : https://learn.microsoft.com/en-us/graph/api/resources/mailboxsettings?view=graph-rest-1.0 . Aucune API privée, aucun accès élargi aux boîtes ni extraction depuis les messages envoyés n’est utilisé.

La signature CDInnov mémorisée pour le compte connecté est insérée automatiquement et prévisualisée. Avant la première configuration, une signature simple reprend le nom et l’adresse de la session ; elle est éditable. Le texte générique « Conseil Développement Innovation » a été retiré des messages par défaut ; il peut toujours figurer dans une signature personnelle si son auteur le souhaite. Le texte ou l’image de la signature Outlook peut être renseigné une fois dans « Ma signature ».
