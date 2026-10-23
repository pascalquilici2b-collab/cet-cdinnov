# Marchés, saisie et Outlook — 23 octobre 2026

## Livraison

- Pièces du marché : « Tout analyser » violet déclenche la lecture de toutes les pièces et l’application des propositions reconnues, en conservant les valeurs manuelles et la traçabilité des divergences. Les minimum et maximum contractuels sont groupés sur la même ligne.
- Devis/factures : icônes des champs, adresse de retour `cdi@cdinnov.com` modifiable au crayon (aussi sur le devis), corbeilles rouges, confirmation d’enregistrement et finalisation par coche verte animée. Le PDF archivé reste immuable.
- Aperçu : impression de toutes les pages du PDF courant, en A4, sans les contrôles d’édition. Les pages imprimées sont rasterisées à 144 dpi ; le téléchargement PDF conserve le document original.
- Clients : jusqu’à 30 contacts (nom, e-mail, fonction), avec contrôle serveur et conservation des logos et contacts lors du préremplissage. Aucun changement de schéma SQL : attribut JSON optionnel et rétrocompatible.
- E-mail : sélection d’un contact ou saisie manuelle. Les anciens appels Brevo ne sont plus utilisés par cette interface. Un brouillon ou un fichier de message ne change jamais le statut du document en « envoyé ».

## Microsoft 365 individuel

Application Microsoft créée avec l’accord du propriétaire : `CDInnov · Brouillons Outlook`.

- Application publique SPA : `57d5820b-fc30-4be3-8ca8-07ed6b274ce3`.
- Annuaire CDInnov uniquement : `9feb51cf-31ec-4696-af55-cc7f7939e624`.
- Retour : `https://app.cdinnov.eu/platform/outlook-callback.html` (page bridge MSAL v5 sans COOP).
- MSAL Browser 5.26.0, PKCE, cache de session propre à l’onglet, aucun secret d’application ni jeton Microsoft stocké dans D1.
- Autorisations déléguées demandées à chaque personne : `User.Read` et `Mail.ReadWrite`. Aucune autorisation `Mail.Send` ni permission applicative globale. Microsoft impose `Mail.ReadWrite` pour créer un brouillon, même si cette permission est plus large que les seules opérations utilisées ici.
- « Mon compte Outlook » dans les paramètres de facturation et la fenêtre e-mail. Chaque personne connecte son compte ; ne jamais sélectionner automatiquement le premier compte Microsoft disponible. Le nom d’utilisateur Microsoft, puis `/me`, sont vérifiés contre la session CDInnov, à nouveau contrôlée avant la mutation.
- Création atomique du brouillon avec sa pièce jointe via `/me/messages`. L’envoi est réalisé ensuite dans Outlook par l’utilisateur. Le lien retourné ouvre Outlook web ; le brouillon est également synchronisé dans Outlook installé avec le même compte.
- La propriété étendue de corrélation retrouve un brouillon après perte de réponse. Un POST au résultat incertain ne se répète pas aveuglément. Ne jamais convertir cette récupération en un nouvel envoi automatique.
- Pièce jointe directe limitée à moins de 3 Mo. Au-delà, bouton de secours « Télécharger le message » : fichier `.eml` UTF-8 avec `X-Unsent: 1` et PDF joint exact, jusqu’à la limite du moteur PDF. Ouverture manuelle dans Outlook ; le navigateur ne peut pas imposer l’ouverture automatique d’une application locale avec pièce jointe.

## Vérifications

- `node platform/billing-contacts-outlook-test.mjs` : vrai navigateur, Worker/D1 isolé, moteur PDF réel. Contacts, conservation du logo, rejets invalides, réouverture, crayon e-mail, coche de sauvegarde/finalisation, impression A4 multipage, message MIME et pièce jointe identique à l’archive, mode nuit et mobile, absence d’appel d’envoi.
- `node --test platform/billing-microsoft-draft-test.mjs` : séparation Pascal/David/Albert avec Microsoft simulé, refus d’un autre compte et d’un changement de session, corrélation, perte de réponse, refus explicite, limite de taille. Aucun e-mail réel envoyé pour ces essais.
- `node platform/markets-import-ui-test.mjs` : ZIP PDF/BPU/Word, lecture réelle et Qwen simulé, analyse de toutes les pièces, préservation des valeurs manuelles, montants alignés, nuit/mobile.
- Répertoire et correspondance clients : 9 tests. PDF : 36 tests et 52 sous-tests passés ; assertion supplémentaire de l’adresse de retour sur le devis.
- Tests de connexion Microsoft réelle et publication : résultats conservés dans `.private/contacts-outlook-20261023/`. Une permission demandée n’est pas une permission accordée : chaque compte doit effectuer sa première connexion/acceptation Microsoft.

Pas de changement de forfait, ressources ou région d’hébergement. Sauvegarde avant publication et vérification des documents existants par le script privé de livraison.
