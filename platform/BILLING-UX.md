# Design et parcours de facturation

La demande de Pascal du 20 octobre 2026 fait de la qualité du design et de l’intuitivité un critère de recette, au même titre que les calculs et l’intégrité des documents.

## Direction

Une interface de travail calme, lisible et cohérente avec le portail CDInnov : hiérarchie typographique, surfaces sobres, accent vert pour les actions et états confirmés. Le document reste blanc en thème sombre. Les informations nécessaires au travail sont prioritaires ; les détails de validation restent secondaires.

## Parcours implémentés

- **Réutiliser** : carnets clients et prestations recherchables ; devis ou facture depuis une fiche client ; création et sélection dans un dialogue sans perdre la saisie du document. Les coordonnées et tarifs sont copiés et restent ajustables.
- **Préparer** : objet, dates, client, prestations, totaux en direct. Les coordonnées de l’émetteur déjà remplies et les conditions sont repliables. Affaires, marchés et références constituent une section secondaire facultative.
- **Enregistrer** : état de sauvegarde visible, navigation protégée, conflit expliqué sans perte de la saisie. Les paramètres sont copiés dans chaque nouveau document.
- **Vérifier** : aperçu en direct pendant la saisie ; vrai PDF paginé après enregistrement, pages précédente/suivante, zoom et ajustement à la largeur. Une modification invalide l’aperçu enregistré.
- **Finaliser** : accès explicite « Vérifier et finaliser », choix de la série, confirmation du gel, contrôle préalable. Une erreur de rendu permet la reprise sous le même numéro.
- **Consulter** : après réservation, fiche de lecture avec numéro, état, montant et coordonnées. Après réussite, affichage du PDF réellement archivé et téléchargement Factur-X principal. XML et rapports accessibles dans un volet replié.
- **Suivre un devis** : déclarer un envoi, enregistrer l’accord ou le refus avec date et origine, corriger une réponse avec motif et consulter l’historique. Une facture liée reste accessible depuis le devis. Sur mobile, le formulaire utilise toute la largeur du résumé.
- **Retrouver** : recherche par numéro, client, objet ou code affaire. Le statut et le numéro restent visibles dans la liste mobile.

Le téléchargement et l’émission ne sont pas présentés comme une transmission AGIRIS. Les factures importées et leur convertisseur restent accessibles depuis « Historique & dossiers ».

## Recette et suites

Les tests navigateur vérifient sauvegarde, conflit, conservation des données, conversion, erreurs et reprises, pagination PDF, zoom, changement de thème, mobile et déconnexion. Le lecteur PDF reçoit les octets par l’API authentifiée ; aucun jeton n’apparaît dans une URL, aucune réponse tardive ne remonte après démontage.

Les filtres distinguent les brouillons, la finalisation, les reprises et les états commerciaux des devis (à envoyer, en attente, accepté, refusé, expiré). À poursuivre : erreurs de validation reliées aux champs, révisions commerciales des devis, suivi des règlements et vue d’ensemble. Une revue utilisateur sur ces parcours reste nécessaire avant la recette finale. Les captures de démonstration utilisent des documents fictifs.
