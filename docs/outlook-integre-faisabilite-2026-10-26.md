# Outlook dans CDInnov — faisabilité

Étude du 26 octobre 2026, sans mise en œuvre d’un Outlook intégré.

La fenêtre officielle Outlook Web ne peut pas être affichée à l’intérieur de l’application : Microsoft indique explicitement que le lien `webLink` d’un message n’est pas accessible dans une iframe. L’authentification interactive Microsoft impose également une fenêtre distincte. [Documentation du message Outlook](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0), [Restrictions d’authentification dans une iframe](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/iframe-usage).

Le fonctionnement retenu reste la préparation dans CDInnov, puis l’ouverture du brouillon et de ses pièces jointes dans Outlook. Chaque salarié connecte sa propre boîte ; aucune boîte commune n’est imposée. La confirmation « Envoi effectué » est une déclaration de l’utilisateur, pas une preuve automatique de réception.

Une interface de rédaction entièrement dans CDInnov est techniquement possible avec Microsoft Graph, mais il s’agit d’une interface CDInnov, pas de la fenêtre Outlook. L’envoi direct nécessite une autorisation déléguée `Mail.Send` par utilisateur, une confirmation avant envoi et un traitement des échecs. Un écran d’essai est désormais disponible, décrit ci-dessous ; l’envoi direct des factures aux clients n’est pas activé par ce pilote. Le droit de rédaction de brouillons suffit au parcours existant des factures et devis. [Créer un brouillon](https://learn.microsoft.com/en-us/graph/api/user-post-messages?view=graph-rest-1.0), [Envoyer un message](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0).

## Essai de rédaction CDI ajouté le 26 octobre

Dans Facturation → Paramètres → Tester la rédaction CDI : message éditable, PDF de démonstration et pièces jointes amovibles, relecture puis confirmation. Cet essai envoie exclusivement vers la propre adresse de la session ; aucun destinataire client, copie ni changement de statut d’une facture. Le parcours existant des factures et devis reste disponible séparément.

L’autorisation déléguée Mail.Send est demandée uniquement lorsque la personne clique sur « Activer l’envoi Outlook ». Chaque personne utilise son compte, sans permission d’application ni accès global aux boîtes. Aucun consentement administrateur global n’est accordé. Les jetons restent dans la session du navigateur ; seuls les identifiants opaques du suivi de l’essai sont conservés localement.

Le message est créé en brouillon avec ses pièces, relu pour vérifier son contenu, puis envoyé par Graph après confirmation. Un identifiant immuable permet de contrôler sa présence dans les éléments envoyés. La réponse HTTP 202 signifie prise en charge, pas réception chez le destinataire. Un résultat incertain est vérifié sans renvoyer le message. [Envoi d’un brouillon](https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0), [Suivi par identifiant immuable](https://learn.microsoft.com/en-us/graph/outlook-immutable-id), [Consentement incrémental](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/resources-and-scopes).

Tests automatisés sur Graph simulé : comptes distincts, contrôle de la session, refus des destinataires tiers, copies et brouillons modifiés ; refus d’autorisation et perte de réponse sans double envoi. Interface vérifiée en clair, sombre et mobile. Le test réel nécessite le consentement Microsoft de l’utilisateur et sa confirmation d’envoi ; ces tests automatisés n’envoient aucun message réel.

Pour les pièces volumineuses, le parcours actuel propose le fichier de message `.eml` avec ses pièces jointes ; le dépôt Graph direct reste limité à un total inférieur à 3 Mo, afin de créer le brouillon et ses pièces en une seule opération. Un envoi de fichiers plus volumineux via Graph demanderait des sessions de téléversement et leur suivi.
