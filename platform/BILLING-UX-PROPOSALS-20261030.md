# Commandes, marchés et ajout client — propositions du 30 octobre 2026

## État

L’utilisateur a retenu **B — Commandes regroupées sous chaque marché**. Cette variante est intégrée à Suivi engagements, avec l’ajout au carnet clients depuis l’éditeur, pour publication après vérification. La version de départ est le commit `0e0c41c`. Les modifications sans rapport de BILLING-AGIRIS et du rapport de sécurité sont conservées séparément.

## Propositions présentées et choix

- **A — Liste et cartes (recommandée)** : les bons sont des lignes compactes comparables ; les marchés sont des cartes de synthèse. Icône document pour un bon, dossier pour un marché ; barre de consommation, montant disponible, factures dépliables et aperçu de la pièce.
- **B — Dossiers — retenue** : regroupement de chaque marché et de ses bons, avec une hiérarchie visuelle explicite. Plus utile pour parcourir un contrat à la fois.
- **C — Liste et détail** : sélection d’un bon à gauche, références, consommation, factures et pièce à droite. Plus utile pour examiner les engagements successivement.

Maquette interactive autonome conservée en privé : `.private/engagement-design-20261030/proposals.html` (données fictives). L’interface métier utilise les composants de l’app et les données de l’API, pas cette maquette.

## Suivi engagements

- Un dossier par identifiant de marché, avec les commandes en lignes compactes, leurs consommations facturées, réservations de brouillons et montants disponibles.
- L’en-tête reprend la consommation globale du marché et sa date de réinitialisation. Les filtres ne modifient pas ces valeurs globales.
- Factures liées accessibles depuis chaque bon, pièces consultables en aperçu PDF et téléchargeables ; historique annuel conservé dans Marchés globaux.
- Les identifiants de marchés, bons, devis et factures restent inchangés. Les commandes sans marché disponible restent visibles dans un dossier explicite.

## Éditeur clients

- Une commande unique ouvre le carnet, avec icône ou logo du client, identité lisible et focus clavier.
- Après recherche annuaire, les champs restent modifiables. L’action d’ajout est placée après les coordonnées et enregistre les valeurs présentes au clic, y compris la raison sociale personnalisée et les détails annuaire du bon établissement.
- Une identité exacte déjà enregistrée est liée sans écraser sa fiche ni son logo. Un autre SIRET permet une fiche distincte.
- Une ancienne fiche sans SIRET reconnue uniquement par nom, SIREN ou logo est une suggestion à vérifier. Aucun rattachement automatique : choix du carnet ou ajout explicite du nouvel établissement.
- Confirmation verte locale, traitement des erreurs, double clic et réponse perdue sans doublon. Les corrections ultérieures au document n’écrasent pas la fiche client.
- Un changement manuel d’identifiants retire les données juridiques récupérées pour l’établissement précédent.

Le changement serveur est limité à la déduplication lors d’une création avec SIRET. Les anciens parcours de préremplissage ADEC/CCI et la conservation de leurs logos restent inchangés.

## Vérifications et reprise

- Tests API d’ajout + tests existants du répertoire : 21 tests réussis ; anciens tests de rapprochement ADEC/CCI réussis.
- Compilation TypeScript réussie.
- Maquette : trois variantes, onglets, recherche, pièces/factures, ajout simulé, deux thèmes, viewport mobile testés ; six captures privées disponibles.
- Parcours navigateur réel de l’éditeur avec Worker/D1 locaux : 10 tests réussis, 185 requêtes au Worker, aucune erreur JavaScript ; résultats détaillés dans `.private/client-enrollment-qa/verification.json`. Les services annuaire/PDF seuls sont simulés ; aucun envoi ni donnée de production.
- Le contrôle client et les barres globales de navigation/attention restent contenus sur mobile ; le test vérifie aussi l’absence de débordement de la page entière.
- Groupement et limites des bons : 8 tests réussis, incluant les marchés homonymes, les orphelins, les périodes annuelles, les réservations, la concurrence et les plafonds de facturation.
- Parcours Suivi engagements avec Worker/D1/R2 locaux : 11 tests réussis, aucune erreur JavaScript. PDF réellement rendu, téléchargement vérifié octet par octet, fermeture avant réponse tardive, ouverture des factures natives/importées, corbeille/restauration, filtres, historique annuel, clavier et mobile 390 px. Huit captures d’interface conservées, avec inspection indépendante des rendus clair/sombre.
- Projection des données réelles en lecture seule : 19 engagements répartis dans 6 dossiers, 22 liens de factures et 21 pièces préservés ; aucune modification des données.

Typecheck et construction terminés avec succès. Les détails de vérification et empreintes de données sont conservés dans `.private/engagement-dossiers-20261030/`, les captures et résultats navigateur dans `.private/engagement-tracking-qa/` et `.private/client-enrollment-qa/`.

La demande de tester les prochains parcours fonctionnels avec plusieurs agents est consignée dans `AGENTS.md` à la racine.
