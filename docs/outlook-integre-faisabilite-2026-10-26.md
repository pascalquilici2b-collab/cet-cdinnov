# Outlook dans CDInnov — faisabilité

Étude du 26 octobre 2026, sans mise en œuvre d’un Outlook intégré.

La fenêtre officielle Outlook Web ne peut pas être affichée à l’intérieur de l’application : Microsoft indique explicitement que le lien `webLink` d’un message n’est pas accessible dans une iframe. L’authentification interactive Microsoft impose également une fenêtre distincte. [Documentation du message Outlook](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0), [Restrictions d’authentification dans une iframe](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/iframe-usage).

Le fonctionnement retenu reste la préparation dans CDInnov, puis l’ouverture du brouillon et de ses pièces jointes dans Outlook. Chaque salarié connecte sa propre boîte ; aucune boîte commune n’est imposée. La confirmation « Envoi effectué » est une déclaration de l’utilisateur, pas une preuve automatique de réception.

Une interface de rédaction entièrement dans CDInnov est techniquement possible avec Microsoft Graph, mais ce serait une interface CDInnov, pas la fenêtre Outlook. L’envoi direct nécessiterait notamment une autorisation déléguée `Mail.Send` par utilisateur, une confirmation avant envoi et un traitement des échecs. Cette évolution n’est pas implémentée. Le droit actuel de rédaction de brouillons suffit au parcours existant. [Créer un brouillon](https://learn.microsoft.com/en-us/graph/api/user-post-messages?view=graph-rest-1.0), [Envoyer un message](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0).

Pour les pièces volumineuses, le parcours actuel propose le fichier de message `.eml` avec ses pièces jointes ; le dépôt Graph direct reste limité à un total inférieur à 3 Mo, afin de créer le brouillon et ses pièces en une seule opération. Un envoi de fichiers plus volumineux via Graph demanderait des sessions de téléversement et leur suivi.
