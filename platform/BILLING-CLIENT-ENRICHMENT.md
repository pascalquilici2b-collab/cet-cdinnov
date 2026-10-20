# Logos et préremplissage clients

Demande du 20 octobre 2026 : reprendre les logos de cdinnov.eu et connecter les sources disponibles pour éviter la ressaisie des clients.

## Disponible

- 25 logos récupérés dans la section références de `https://www.cdinnov.eu/`. Les fichiers sont servis par l’application, sans appel tiers lors de leur affichage. `client-logos/sources.json` conserve l’adresse d’origine, la date et l’empreinte de chaque fichier.
- Affichage dans le carnet clients, le choix d’un établissement et la rubrique Client du document. Correspondances explicites de noms ; les sigles courts servent uniquement aux fiches sans identifiant. Une correspondance inconnue ou une image indisponible conserve les initiales.
- Recherche volontaire par nom, SIREN ou SIRET dans les fiches et l’éditeur. Choix explicite de l’établissement, puis préremplissage de la raison sociale, adresse, complément, code postal, ville, pays, SIREN et SIRET. Aucun enregistrement à la simple recherche.
- Source : API publique Recherche d’entreprises, `https://recherche-entreprises.api.gouv.fr/docs/`. Accès navigateur autorisé par CORS, sans compte PISTE ni clé ; `credentials: omit`, aucun jeton CDInnov, aucun referrer. Seule la recherche saisie est envoyée.
- Établissements actifs et diffusibles uniquement ; exactitude du SIRET exigée pour une recherche à 14 chiffres. Pas de sélection automatique du siège à la place d’un autre établissement.
- Réponses limitées en taille et en durée, annulation sur nouvelle saisie ou fermeture, messages d’indisponibilité sans perte des champs. Résultats incomplets signalés par une invitation à préciser le SIRET.
- Les champs restent modifiables. Un changement d’entreprise retire les anciennes coordonnées fiscales, de contact et de routage ; un changement d’établissement retire l’ancien routage. L’aide est dans une info-bulle. Une coche bleue animée confirme la copie, avec respect du mouvement réduit.
- Le choix dans le document modifie seulement son brouillon. Le répertoire reste indépendant et les documents émis ne sont pas modifiés.

## PISTE : accès à reprendre

Le propriétaire a ouvert une session PISTE dans le navigateur intégré à l’adresse `https://piste.gouv.fr/apimgt/api-center`. Cette session fournit son URL au contexte, mais aucun outil de navigation/lecture d’onglets n’est exposé ici. REA MCP est également absent de la liste effective des outils. La tentative d’ouverture d’une fenêtre Chrome dédiée a été bloquée par le contrôle d’approbation automatique, sans motif détaillé ; aucun contournement effectué.

Reconnexion/redémarrage Codex proposé au propriétaire, puis redécouverte des outils effectifs. Ne pas répéter l’installation REA si sa configuration est déjà alignée. Ne pas demander de clés ou de mots de passe dans le chat.

Les abonnements PISTE, leurs environnements, droits et identifiants n’ont pas pu être lus. Aucun connecteur PISTE n’est annoncé comme actif et aucune clé n’a été créée, copiée ou publiée. Dès que les outils sont disponibles :

1. Consulter les applications et abonnements autorisés, puis les spécifications officielles correspondantes.
2. Distinguer identité Sirene, destinataires Chorus Pro et annuaire de facturation électronique ; conserver la provenance de chaque donnée.
3. Installer les secrets côté serveur dans le gestionnaire prévu, jamais dans le JavaScript public, Git ou le dossier partagé.
4. Vérifier les lectures sur l’environnement autorisé, les établissements et les adresses électroniques. Aucune émission/transmission de facture nécessaire pour cette intégration.
5. Brancher les champs supplémentaires réellement fournis et vérifiés, puis tester et publier.

La TVA, l’e-mail, les coordonnées bancaires et l’adresse électronique de réception ne sont pas déduits d’un SIREN. La connexion PISTE ne remplace pas l’activation du service PDF/Factur-X natif encore différée.

## Vérification

- `node platform/billing-company-test.mjs` : schéma de réponse, établissement exact, exclusions, champs publics autorisés, changement d’identité, requêtes sans identifiants, erreurs.
- Build et TypeScript.
- `platform/billing-company-browser-test.mjs` : parcours avec API d’annuaire simulée et Worker/D1 réels locaux, sauvegarde client, devis, logo, 429, réponse obsolète, thèmes clair/sombre à 320/390/1440 px et mouvement réduit.
- `platform/billing-directory-browser-test.mjs` : régression du carnet, conflits, archive/restauration, instantanés, dialogues et réponse perdue ; 44 requêtes, aucune erreur JavaScript.
- Requêtes de lecture réelles à l’annuaire : `200076958` retrouve le siège à Ajaccio ; `20007695800053` retourne seulement l’établissement à Bastia.
- Captures locales synthétiques : `platform/.private/client-enrichment-qa/`. Aucune fiche ou facture réelle créée en production.
- Worker, base de données et services d’émission inchangés. Vérification des fichiers publics après publication consignée dans le dossier de reprise.
