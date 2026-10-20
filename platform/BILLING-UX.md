# Design et parcours de facturation

La demande de Pascal du 20 octobre 2026 fait de la qualité du design et de l’intuitivité un critère de recette, au même titre que les calculs et l’intégrité des documents.

## Direction

Une interface de travail calme, lisible et cohérente avec le portail CDInnov : hiérarchie typographique, surfaces sobres, accent vert pour les actions et états confirmés. Le document reste blanc en thème sombre. Les informations nécessaires au travail sont prioritaires ; les détails de validation restent secondaires.

### Aide à la demande — préférence explicite du 20 octobre

Limiter les textes explicatifs permanents. Une notion particulière reçoit un petit bouton « ? » à côté du titre ou du libellé. L’explication apparaît au survol, au focus clavier ou au toucher ; elle reste lisible quand le pointeur la rejoint. Échap, un clic extérieur ou un second toucher la referment. Une seule bulle est ouverte à la fois. Les aides restent liées aux champs pour les lecteurs d’écran, sans bouton imbriqué dans un label de formulaire.

`billing-help.tsx` place la bulle hors des cartes qui pourraient la couper et à l’intérieur du dialogue natif lorsqu’il est ouvert. La position respecte les bords de l’écran ; la cible tactile mesure 44 pixels. Les erreurs, modifications non enregistrées, blocages et conséquences d’une confirmation restent visibles. Les aides ne déclenchent ni soumission, ni ouverture de rubrique, ni écriture métier.

Les répertoires, paramètres, conditions, suivi des paiements et devis, révisions, finalisation et aperçu utilisent cette présentation. Les encarts purement explicatifs sont supprimés ; les paramètres affichent les deux groupes de champs côte à côte sur grand écran. Le dépôt manuel AGIRIS est identifié sans suggérer qu’une facture a été transmise.

Validation : `billing-help-browser-test.mjs` couvre survol, passage du pointeur sur la bulle, clavier, Échap dans un dialogue, clic/toucher, absence de soumission et affichage clair/sombre à 320/390 px. Les suites navigateur de facturation, répertoires, validation, devis, révisions et règlements passent aussi, sans erreur JavaScript. Les captures de ce jalon restent privées et fictives.

## Parcours implémentés

- **Réutiliser** : carnets clients et prestations recherchables ; devis ou facture depuis une fiche client ; création et sélection dans un dialogue sans perdre la saisie du document. Les coordonnées et tarifs sont copiés et restent ajustables.
- **Préparer** : objet, dates, client, prestations, totaux en direct. Les coordonnées de l’émetteur déjà remplies et les conditions sont repliables. Affaires, marchés et références constituent une section secondaire facultative.
- **Compléter** : vérification regroupée par rubrique et liens vers les champs, avec ouverture automatique des sections et passage à la saisie mobile. Les messages apparaissent après interaction ou vérification demandée ; la correction les retire sans déplacer le curseur. Voir [BILLING-VALIDATION.md](BILLING-VALIDATION.md).
- **Enregistrer** : état de sauvegarde visible, navigation protégée, conflit expliqué sans perte de la saisie. Les paramètres sont copiés dans chaque nouveau document.
- **Vérifier** : aperçu en direct pendant la saisie ; vrai PDF paginé après enregistrement, pages précédente/suivante, zoom et ajustement à la largeur. Une modification invalide l’aperçu enregistré.
- **Finaliser** : accès explicite « Vérifier et finaliser », choix de la série, confirmation du gel, contrôle préalable. Une erreur de rendu permet la reprise sous le même numéro.
- **Consulter** : après réservation, fiche de lecture avec numéro, état, montant et coordonnées. Après réussite, affichage du PDF réellement archivé et téléchargement Factur-X principal. XML et rapports accessibles dans un volet replié.
- **Suivre un devis** : déclarer un envoi, enregistrer l’accord ou le refus avec date et origine, corriger une réponse avec motif et consulter l’historique. Une facture liée reste accessible depuis le devis. Sur mobile, le formulaire utilise toute la largeur du résumé.
- **Réviser une proposition** : préparer un nouveau brouillon lié avec un motif, parcourir les versions et leurs montants, ou abandonner une révision non finalisée pour réactiver le parent. La liste principale montre la version en cours ; les autres restent accessibles dans l’historique et les filtres dédiés.
- **Retrouver** : recherche par numéro, client, objet ou code affaire. Le statut et le numéro restent visibles dans la liste mobile.

Le téléchargement et l’émission ne sont pas présentés comme une transmission AGIRIS. Les factures importées et leur convertisseur restent accessibles depuis « Historique & dossiers ».

## Recette et suites

### Retouche Apple du 20 octobre 2026

L’application reprend les surfaces blanc/gris, l’encre `#1d1d1f`, le bleu d’action `#0066cc`, la typographie système, les cartes de 18 px et les boutons principaux en capsule du document `DESIGN-apple.md` fourni par le propriétaire. Les dimensions sont adaptées à une application de gestion ; les états d’erreur restent distincts. Le document imprimé conserve son modèle propre.

Le titre redondant « CDINNOV · GESTION COMMERCIALE / Facturation. » est supprimé. « Historique & dossiers » est regroupé avec Paramètres dans la navigation, sur une même ligne même sur téléphone. Les accès aux marchés/contrats, codes affaires et anciennes factures restent dans ce menu.

Les six rubriques de l’éditeur affichent leur numéro puis une coche bleue animée lorsque leurs champs sont complets. Les marqueurs utilisent les contrôles de préparation existants, se retirent dès qu’un champ redevient invalide et n’entraînent ni sauvegarde ni émission. Le document demande un objet et ses dates/conditions ; la rubrique facultative de références reste neutre tant qu’elle est vide. Le libellé accessible précise l’état et `prefers-reduced-motion` supprime l’animation. Une coche ne remplace jamais le contrôle natif avant finalisation.

Les tests navigateur vérifient sauvegarde, conflit, conservation des données, conversion, erreurs et reprises, pagination PDF, zoom, changement de thème, mobile et déconnexion. Le lecteur PDF reçoit les octets par l’API authentifiée ; aucun jeton n’apparaît dans une URL, aucune réponse tardive ne remonte après démontage.

Les filtres distinguent les brouillons, la finalisation, les reprises et les états commerciaux des devis (à envoyer, en attente, accepté, refusé, expiré), ainsi que les anciennes versions et révisions abandonnées. Les règlements et corrections sont disponibles dans la fiche de facture. À poursuivre : vue d’ensemble, parcours liés d’avoirs/acomptes et qualification des diagnostics supplémentaires du moteur natif. Une revue utilisateur sur ces parcours reste nécessaire avant la recette finale. Les captures de démonstration utilisent des documents fictifs.
