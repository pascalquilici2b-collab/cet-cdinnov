# Répertoires, suivi et conversion — 25 octobre 2026

- Clients : suppression depuis la liste et la fiche, confirmation, corbeille et restauration. Le champ d’archivage existant préserve les liens et instantanés documentaires ; les clients issus de Budgets sont également pris en charge.
- Projets : alignement indépendant du logo, du nom, du statut et de l’action de modification, textes longs adaptés au mobile.
- Suivi engagement : retrait des rapprochements à vérifier de l’écran (preuves conservées), compteurs et cartes compacts, retrait des deux statistiques globales demandées. Les factures natives ouvrent leur vue documentaire et les importées leur fiche historique.
- Devis/factures : pagination centrée, 10 lignes par défaut, choix 10/25/50/100, retour à la première page au changement de taille. Fond neutre distinct pour les factures historiques importées. Le modèle actuel n’a pas de liste de devis historiques importés ; les devis natifs ne sont pas artificiellement classés comme imports.
- Catalogue : 16 descriptions générales enrichies, une action par ligne précédée de « - ». Mise à jour par l’API avec contrôle de version, sauvegarde des valeurs précédentes et conservation des autres champs, dont tarifs et unités. Les BPU/DQE et les documents déjà émis restent indépendants.
- Convertisseur Factur-X : thème Apple partagé entre la version autonome et le mini-logiciel embarqué, couleurs claires/sombres, arrondis, formulaires et actions harmonisés. Le thème embarqué suit celui du portail.
- Extraction : « Montant HT » dans l’en-tête du tableau ne doit pas absorber le « 1. » de la première ligne. Priorité au total HT net après remise ; une somme totale de TVA n’est pas additionnée une deuxième fois au détail. Le numéro sous « Numéro du document » est reconnu. Les véritables écarts de TVA restent signalés.

## Vérifications

Tests D1 des clients, conflits, archivage et conservation des documents ; contrôles des plafonds de commandes et de la corbeille ; intégrité Factur-X. Parcours navigateur des deux suppressions client, restauration, pagination, liens factures natives/importées, projets mobiles et thèmes. PDF réellement produits par le moteur avec et sans remise, plusieurs taux, ancien format et écart fiscal réel.

Le Worker n’a pas changé : aucune migration ni modification de ses paramètres n’est nécessaire. Publication de l’interface par GitHub Pages et du moteur PDF par le service Render existant. Sauvegardes, mises à jour du catalogue et preuves de livraison : `platform/.private/billing-polish-20261025/`.
