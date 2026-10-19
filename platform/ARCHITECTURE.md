# Architecture de référence — app.cdinnov.eu

**Décision retenue : React/TypeScript + API Cloudflare Workers + D1 + stockage R2.**
**État vérifié au 19 octobre 2026 : migration en cours.**

Ce document fixe la cible technique pour l’ensemble de l’application et distingue ce qui existe de ce qui reste à réaliser. Il remplace les passages devenus obsolètes des premiers rapports de comparaison. Il ne constitue pas un procès-verbal de fin de migration ni de recette complète du logiciel de facturation.

## Point d’avancement du 19 octobre

Les principaux écrans sont migrés. Le travail restant porte surtout sur le serveur, les droits d’accès, les sauvegardes par enregistrement et le cycle complet de facturation. La cible reste **React/TypeScript + Cloudflare Workers + D1 + R2**, sans nouvel abonnement.

La tranche actuelle place le portail, les fichiers historiques et les notifications derrière la session commune. Les comptes et leurs mots de passe sont conservés. Le document KV du portail est copié à l’identique dans D1, qui devient sa seule source d’écriture avec contrôle de version. L’ancien document KV est conservé comme point de reprise, sans route publique de lecture ou d’écriture.

Les formulaires de congés et déplacements utilisent les couleurs du thème sombre pour les titres, champs, listes et encarts. Le bloc « Organisation de l’équipe / Un agenda partagé, une vue d’ensemble » est retiré. Aucun abonnement ni fournisseur supplémentaire n’est ajouté.

Les dernières corrections d’interface sont conservées : portraits ronds de 30 px dans les notes de frais, statut envoyé bleu avec enveloppe et payé vert avec billet. Ces styles voyagent avec leur composant React et résistent à une ancienne feuille de style générale. La proposition Poppins/Aptos reste un visuel séparé ; elle n’a pas remplacé la typographie de l’application.

La recette de cette tranche corrige aussi un écran vide à la déconnexion depuis les Marchés : le sélecteur des éléments de menu touchait par erreur le corps de la page. Il est désormais limité aux entrées de navigation, avec un contrôle de non-régression dans le navigateur.

L’inventaire a été relu dans la sauvegarde privée précédant cette tranche : portail, congés, déplacements, budgets, feuilles et marchés. Les volumes détaillés figurent uniquement dans la copie interne du rapport, sans être publiés avec le site. Ils constituent un instantané, pas une mesure du trafic ou du CPU. Aucun pourcentage global de migration n’est avancé : les tâches restantes n’ont pas toutes le même poids.

## 1. Décision et raisons

Conserver l’infrastructure en place et remplacer progressivement les composants historiques. Les volumes observés lors de l’audit du 18 octobre restent compatibles avec une petite application d’équipe ; le principal travail porte sur les autorisations, les écritures ciblées et les règles métier.

| Élément | Choix de référence | État réel |
|---|---|---|
| Interface | React et TypeScript ; composants partagés ; modules chargés à la demande | Principaux écrans repris ; coque, connexion et adaptateurs historiques encore présents |
| Construction | Node.js et pnpm en développement ; esbuild et Vite selon les modules | Scripts reproductibles dans le dépôt commun |
| Hébergement statique | Publication GitHub Pages existante sur le domaine de l’application | Conservée ; pas de nouvel hébergeur |
| API | TypeScript sur Cloudflare Workers, organisé par domaine | Entrée commune typée ; délégation à des services JavaScript historiques |
| Données métier | D1, SQL paramétré, migrations versionnées et tables par entité | Tables Marchés/Agenda ; projection Budgets ; plusieurs documents JSON encore sources d’écriture |
| Fichiers | R2 privé, références et empreintes dans la base | Stockage existant conservé ; pièces Marchés encore en blocs dans D1 |
| Identité | Session commune, habilitations contrôlées sur chaque route serveur | Connexion et autorisations serveur en TypeScript ; comptes conservés, sessions révocables, portail et fichiers protégés |
| Analyse documentaire | Qwen3 via Workers AI, propositions sourcées et validation humaine | Déjà intégré aux marchés |
| PDF, OCR et Excel | Traitement dans le navigateur quand possible ; outils spécialisés conservés | PDF.js, Tesseract et lecteurs Office locaux ; service Python Factur-X séparé |

Node.js sert actuellement à construire et tester les interfaces. Il n’est pas nécessaire de louer un serveur Node permanent pour exécuter l’API quotidienne. Prisma et PostgreSQL ne sont pas des conditions de qualité du logiciel. L’accès actuel repose sur du SQL paramétré ; aucune couche Prisma/Drizzle commune n’est présentée comme déjà déployée.

Un passage à PostgreSQL reste une option si un besoin concret dépasse le modèle transactionnel ou les limites de D1. Il demanderait alors une comparaison sur les opérations réelles, une reprise contrôlée et un plan de retour arrière. Un changement de base seul ne résoudrait pas les conflits d’écriture ni les règles de facturation manquantes.

## 2. Fonctionnement actuel

```mermaid
flowchart TD
  UI[Portail : écrans React/TypeScript et coque historique]
  B[Budgets : React/TypeScript]
  S[Smartsheet : React/TypeScript]
  L[Lecture locale PDF / OCR / Office]
  API[Entrée API TypeScript : Workers]
  LEG[Services historiques maintenus]
  SQL[(D1 : tables et documents JSON)]
  KV[(KV : instantané historique conservé, non modifiable par le portail)]
  R2[(R2 : fichiers existants)]
  AI[Qwen3 : propositions documentaires]
  FX[Service Python Factur-X existant]
  UI --> API
  B --> API
  S --> API
  UI --> L
  L --> API
  API --> LEG
  API --> SQL
  LEG --> SQL
  API --> R2
  API --> AI
  UI --> FX
```

Les services de compatibilité passent par la même identité et lisent désormais le portail dans D1. Le KV n’est plus une source active pour ces services. La suite consiste à réduire les documents JSON globaux à des échanges par enregistrement.

## 3. Ce qui est migré, module par module

| Domaine | Reprise livrée de l’interface | Travail restant |
|---|---|---|
| Tableau de bord | Planning équipe, périodes de congés, demandes, derniers documents, portraits, responsive | Évolutions métier et intégration aux futurs engagements |
| CET et salariés | Listes, mouvements, paramètres et principaux formulaires en React/TS | Calculs et imports à extraire des contrôleurs ; écritures métier par enregistrement à poursuivre |
| Congés et déplacements | Calendrier, listes, soldes, demandes et formulaires en React/TS | Certains détails et contrôleurs de sélection restent historiques |
| Notes de frais et facturier | Listes et formulaires React/TS, filtres, tris et pagination | Contrôleurs exports/signature/Factur-X à typer ; stockage normalisé à poursuivre |
| Outil budgets | Sources et build React/TS réunis dans le dépôt ; thèmes et responsive | Écritures par entité ; remplacement progressif du document global |
| Smartsheet | Application reconstruite depuis les déclarations du bundle en service ; vues, formulaires, tableaux de bord et sauvegardes | Typage strict intégral des composants repris ; écriture par feuille/ligne |
| Marchés et contrats | Neuf rubriques en React/TS : assistant, identité, pièces, tarifs, plafonds, périodes, conditions, points à confirmer, historique | Contrôleur et moteur métier encore JavaScript ; déplacement des pièces vers R2 ; parcours commandes/interventions/factures |
| Connexion et navigation | Interface harmonisée, mode nuit, profil en bas du menu ; serveur de session partagé en TypeScript | Reprise de la coque et du formulaire en React/TS ; permissions configurables |

Les composants Marchés sont vérifiés en TypeScript strict. Leur contrôleur conserve les endpoints, le numéro de version, les règles de validation et le format des enregistrements. React partage son runtime avec les autres écrans du portail et n’est chargé pour les marchés qu’après connexion et habilitation.

Smartsheet dispose d’un contrôle TypeScript de toutes ses sources et d’un contrôle strict séparé de son moteur, de son transport et de sa file de sauvegarde. Certains composants récupérés restent sous inférence permissive. Cette distinction est documentée dans `apps/sheets/README.md`.

## 4. Données, cohérence et conservation

Une seule source accepte les écritures pour chaque domaine. La projection SQL Budgets est alimentée par des triggers dans la transaction du document source : elle n’est pas un second stockage modifiable indépendamment. La migration future doit conserver cette propriété.

| Stockage actuel | Conservation actuelle | Cible |
|---|---|---|
| `app_portal_workspace` (D1) | Copie exacte du document historique ; version, auteur, date ; contrôle atomique des sauvegardes ; réponses filtrées | Tables métier et écritures ciblées |
| Portail KV | Instantané conservé, fermé aux anciennes routes ; aucun écrivain actif | Archive de reprise ; aucun retour automatique vers cette source |
| `app_session_revocations` (D1) | Jetons déconnectés refusés jusqu’à expiration ; empreintes uniquement | Politique de session et rôles configurables |
| `budgets_workspace` | Document source avec contrôle de version et ETag | Écritures ciblées sur clients, projets, lignes, dépenses et rapports |
| `app_budget_records` | Projection indexée, synchronisée dans la même transaction | Transition vers les enregistrements faisant autorité après réconciliation |
| Espace Smartsheet | Document complet avec révision ; sauvegardes sérialisées côté navigateur | Espaces, feuilles, lignes et colonnes modifiables séparément |
| Marchés | Versions, pièces, lectures et analyses conservées | Relations vers commandes, interventions et factures ; pièces privées dans R2 |
| Agenda | Déplacements et versions en base | Référentiels et droits communs |

La migration des interfaces ne modifie pas ces sources de données. Les nouvelles vues restent compatibles avec les sauvegardes et contrôles de version existants. Un conflit doit conserver la saisie locale, présenter une erreur et permettre son export ; il ne doit pas écraser automatiquement la version d’un autre utilisateur.

Le déplacement d’une pièce devra procéder par copie, comparaison de taille et d’empreinte, puis changement de référence. Aucun original ne doit être supprimé avant vérification et maintien d’une lecture compatible pendant la transition.

## 5. Identité et droits : anciens accès fermés

La connexion vérifie la preuve côté serveur. Le navigateur ne télécharge plus les sels et empreintes des mots de passe pour vérifier localement un compte. Les deux routes de connexion existantes restent compatibles et utilisent `platform/identity.ts`. Les comptes sont lus depuis D1 avec une session primaire, sans cache d’identité partagé entre requêtes.

| Surface | Protection livrée | Limite / suite |
|---|---|---|
| Portail | Session requise ; salarié limité à son dossier, annuaire et planning partagés ; comptes résumés sans vérificateurs | Document global encore utilisé comme source d’écriture |
| Sauvegardes | Numéro de version obligatoire ; une seule écriture gagne en cas de concurrence ; copie locale conservée, export avant rechargement | Fusion fine par enregistrement à poursuivre |
| Pièces R2 | Lecture autorisée par référence accessible ou propriétaire du dépôt ; fichiers joints à un autre dossier refusés ; dépôt existant non écrasable | Inventaire périodique des fichiers devenus orphelins |
| Suppression de pièces | Une référence encore utilisée interdit la suppression ; annulation d’un formulaire conserve l’original | Nettoyage différé automatisé à concevoir |
| Notifications | Session, destinataires internes contrôlés et limitation de fréquence | Évènements métier serveur à terme |
| Comptes | Invitation ou réinitialisation par un administrateur ; lien de 24 h utilisable une fois ; retrait/réinitialisation invalide immédiatement les jetons | Rôles et rattachements de salariés encore issus des correspondances existantes |
| Déconnexion | Révocation du jeton dans D1 ; cache et URLs temporaires détruits ; réponses tardives écartées ; changement de compte entre onglets masque les données précédentes | Protection du poste utilisateur toujours nécessaire |
| Sauvegarde / restauration | Export complet réservé aux administrateurs ; import métier versionné préservant les accès actuels | La reprise des comptes après sinistre utilise la sauvegarde privée d’exploitation |

Les justificatifs, bulletins et PDF continuent de s’ouvrir et se télécharger dans l’application, avec une requête authentifiée puis une URL temporaire du navigateur. Les anciennes adresses directes ne sont plus des liens de partage. Aucun jeton n’est placé dans les URLs des fichiers.

L’ancienne clé de document ne donne plus accès au KV. Les routes arbitraires renvoient 410 ; les pièces, données et notifications anonymes sont refusées. Le serveur de compatibilité n’est jamais déployé seul. L’entrée `platform/worker.ts` est l’unique entrée maintenue.

La migration exige une fermeture de l’ancien écrivain avant copie, puis une comparaison exacte de la source finale et de la nouvelle ligne D1. Une ligne primaire absente provoque une maintenance explicite ; le serveur ne réactive pas silencieusement les anciens comptes ou données du KV. Les secrets Cloudflare et les branchements existants sont conservés.

Ces contrôles ne constituent pas un audit exhaustif de sécurité de tous les composants et du poste utilisateur. Le service Python Factur-X conserve son authentification séparée ; il n’est pas remplacé par ce lot.

## 6. Facturation : ce qui reste à construire

Le paramétrage contractuel et le facturier historique existent. Le cycle complet demandé au départ n’est pas encore livré :

```mermaid
flowchart LR
  M[Marché et tarifs validés] --> D[Devis versionné]
  D --> BC[Bon de commande et engagement]
  BC --> I[Interventions par période]
  I --> F[Facture partielle ou finale]
  F --> RI[Relevé d'intervention associé]
  F --> R[Règlements / avoirs / solde]
  BC --> A[Alertes plafond annuel et solde de commande]
```

Le parcours CCIC devra notamment vérifier les tarifs par lieu/profil, les périodes contractuelles, les commandes partielles, les avenants, les tâches prédéfinies avec complément libre et le relevé associé à chaque facture. Les plafonds annuels du marché et les soldes des bons de commande sont deux suivis distincts. Une facture ne doit pas consommer une seconde fois un montant déjà engagé par une commande.

Les montants et arrondis seront déterministes. Une facture émise conservera ses données historiques. Les opérations concurrentes devront empêcher les doubles émissions et les dépassements d’engagement. L’IA aide à lire les contrats ; elle ne décide pas des calculs ni de l’émission.

## 7. IA et fonctionnement dans les allocations gratuites

Le modèle configuré est `@cf/qwen/qwen3-30b-a3b-fp8`, servi par Cloudflare. Qwen publie ses poids sous licence Apache 2.0 ; le service d’inférence reste soumis aux quotas du fournisseur. Aucune clé Claude/OpenAI n’est nécessaire à cette intégration. Voir la [fiche Cloudflare](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/) et la [fiche officielle Qwen](https://huggingface.co/Qwen/Qwen3-30B-A3B).

Les pièces sont lues localement quand le format le permet. Le texte sélectionné est transmis à Cloudflare pour analyse ; ce n’est donc pas une IA entièrement locale. Les propositions sont reliées à des citations et restent ajustables. Une interruption conserve les passages terminés. Une analyse périmée ne peut pas remplacer silencieusement les dernières saisies.

Le module réserve au maximum 5 000 neurones par jour UTC, avec le garde-fou défini dans son code. L’allocation du compte est distincte et peut être partagée avec d’autres applications. Les limites officielles suivantes ont été revérifiées le 19 octobre 2026 :

| Ressource | Allocation / limite gratuite publiée | Conséquence pratique |
|---|---|---|
| Workers | 100 000 requêtes par jour ; 10 ms CPU par invocation HTTP | Éviter les gros traitements et mesurer le CPU par route. [Source](https://developers.cloudflare.com/workers/platform/limits/) |
| D1 | 500 Mo par base ; 5 Go par compte ; ligne limitée à 2 000 000 octets | Normaliser les gros documents JSON avant de rencontrer la limite par ligne. [Source](https://developers.cloudflare.com/d1/platform/limits/) |
| D1, opérations | 5 millions de lignes lues et 100 000 écrites par jour | Indexer les recherches et limiter les réécritures globales. [Source](https://developers.cloudflare.com/d1/platform/pricing/) |
| R2 Standard | 10 Go-mois ; 1 million d’opérations A et 10 millions B par mois | Stocker les fichiers dans R2 et surveiller aussi les opérations. [Source](https://developers.cloudflare.com/r2/pricing/) |
| Workers AI | 10 000 neurones par jour pour le compte | Arrêter/reprendre l’analyse au quota, sans fournisseur payant de secours. [Source](https://developers.cloudflare.com/workers-ai/platform/pricing/) |

Les choix de cette livraison n’ajoutent aucun abonnement ni fournisseur payant. Ils ne prouvent pas que la facture actuelle du compte est nulle : les forfaits, services préexistants et autres usages restent à rapprocher de la facturation du compte. La faible taille des données ne garantit pas, à elle seule, le respect du plafond CPU.

Optimisations déjà présentes : modules chargés à la demande, lectures Budgets conditionnelles par ETag, projection SQL indexée, recherches locales, absence de polling ajouté au tableau de bord, sauvegardes Smartsheet regroupées et sérialisées, analyse documentaire reprenable et exports chargés à la demande.

## 8. Tests, publication et retour arrière

Chaque livraison doit être construite depuis le dépôt, contrôlée en TypeScript et testée avec un serveur local et des données isolées. Les tests Marchés utilisent le Worker complet dans Miniflare et simulent uniquement la réponse du modèle : aucun appel IA payant, notification ou enregistrement en production n’est nécessaire.

Le parcours Marchés couvre la recherche sans requête supplémentaire, la conservation du focus, les montants, les sources obligatoires, les points à confirmer, les conditions, les pièces/doublons/téléchargements, l’application des propositions, les analyses périmées, les exports, les conflits de version, les thèmes et les droits. Le symbole de connexion est vérifié sur mobile et ordinateur.

La tranche Identité ajoute 11 scénarios serveur sur le Worker complet : compatibilité, données mal formées, expiration, audience, preuve erronée, concurrence et rejeu, limitations et retrait de compte. Un test navigateur conserve la vraie dérivation PBKDF2 et la preuve HMAC de la page de connexion ; il couvre rechargement, profils, déconnexion et réponse retardée. Les suites Marchés construisent désormais par défaut l’entrée serveur maintenue, sans se rabattre sur l’ancien serveur partiel.

Le lot Portail ajoute 9 scénarios d’intégration : fermeture des anciens accès, filtrage, contrôle des écritures, conflits, fichiers, notifications, export/restauration, invitations/révocation et déconnexion. La recette navigateur couvre aussi les invitations, la réinitialisation, le dépôt et la lecture des justificatifs. Un essai privé sur une copie des données réelles confirme la connexion et une sauvegarde sans changement métier pour chacun des cinq comptes, sans appel ni écriture en production.

Avant publication : sauvegarde privée des données et de la configuration ; revue de la différence ; conservation des anciens assets pour les onglets ouverts. Après publication : comparaison des fichiers servis au commit et comparaison des données avant/après. Pour une livraison d’interface, le Worker et les bases n’ont pas à être remplacés.

Après cette bascule de sécurité, republier l’ancien frontend non authentifié ou réouvrir l’ancienne route KV n’est pas un retour arrière acceptable. Une correction doit rester compatible avec l’API authentifiée et conserver D1 comme source. Il ne faut pas restaurer une ancienne base par-dessus les nouvelles saisies. Une migration SQL exige en plus un essai de restauration et un rapprochement des nombres, montants, relations et empreintes avant bascule.

## 9. Ordre de clôture de la migration

1. **Identité et fichiers communs** : accès du portail et des fichiers sécurisés ; suivi des habilitations et revue périodique à maintenir.
2. **Écritures ciblées** : Budgets, référentiels et Smartsheet, puis données du portail ; supprimer progressivement les documents globaux comme sources d’écriture après réconciliation.
3. **Cycle métier CCIC** : devis, commandes, engagements, interventions, factures, relevés, règlements et alertes, avec transactions et cas de concurrence.
4. **Derniers composants historiques** : coque, connexion, détails de planning, imports et intégrations ; généraliser le typage strict et retirer les chemins de compatibilité devenus inutiles.
5. **Exploitation** : mesure des quotas et du CPU par route, essai de restauration, revue des accès et recette utilisateur de bout en bout.

La migration sera considérée comme terminée quand les accès privés seront contrôlés par le serveur, les écritures métier ciblées et atomiques, les anciennes voies remplacées ou explicitement maintenues, les données réconciliées et les parcours complets testés. La seule conversion des écrans en React ne suffit pas à remplir ces critères.

## 10. Prochains lots et critères de livraison

| Priorité | Lot | Résultat attendu avant clôture |
|---|---|---|
| Livré | Portail et fichiers derrière la session commune | Lectures filtrées, droits par dossier/pièce, anciennes voies fermées, invitations, export et restauration métier contrôlés |
| P1 | Identités et écritures cohérentes | Révocation et version globale livrées ; poursuivre les écritures par enregistrement et le modèle de rôles |
| P1 | Devis et commandes CCIC | Devis versionnés ; commande rattachée au marché et à une période ; plafond annuel et engagement suivis séparément |
| P1 | Interventions et factures CCIC | Tâches prédéfinies + texte libre ; temps et périodes ; facture partielle/finale et relevé associé ; émission atomique, historique figé |
| P2 | Fin de reprise technique | Coque et détails de planning typés ; composants Smartsheet en mode strict ; anciens contrôleurs retirés après parité |
| P2 | Exploitation | Restauration répétable, mesures CPU/quotas par route, suivi des erreurs et recette métier complète |

Les décisions techniques figurent dans [ADR-0002](decisions/0002-shared-identity.md) et [ADR-0003](decisions/0003-protected-portal.md). Les preuves de sauvegarde et de conservation restent dans le dossier privé de livraison ; aucune sauvegarde de données ou de comptes n’est publiée avec le site.
