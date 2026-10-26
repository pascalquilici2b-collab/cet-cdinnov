# Évolutions du 26 octobre 2026

## Modules réalisés

1. **Marchés et contrats** : types « Consultation ou 3 devis » et « Gré à gré », durée de 6 mois. Consommation des devis calculée par période annuelle et date de réinitialisation affichée.
2. **Devis** : période libre « Autre » combinable avec les semestres ; objet imprimé juste avant la période ; unité Forfait ; suppression des doubles sélecteurs marché/projet dans Votre document. Barre d’engagement et alerte de dépassement non bloquante. Engagement : pièce en premier, analyse Qwen, références Chorus, marché et référence complémentaire conservés lors de la conversion en facture.
3. **Factures / Outlook** : libellé N°, adresse de retour réservée aux devis. Cc cdi@cdinnov.com, relevé joint automatiquement quand il est renseigné, pièces complémentaires amovibles et certificat Chorus facultatif. Le message mentionne les pièces réellement jointes. Bouton de confirmation manuelle de l’envoi, enregistré dans l’historique et affiché Envoyée ; les règlements et retards restent prioritaires. Aucun message réel n’est envoyé par les tests.
4. **Suivi engagements** : sélection des périodes précédentes, historique des devis et bons de commande reçus, sans additionner prévisionnel et facturé. Révisions de devis suivies à la fin de chaque période pour préserver l’historique.
5. **Salariés des clients** : agents, affectations datées aux projets avec pourcentages manuels, lettres Word et documents Excel de paiement, archivage privé et versions des données. Modèle de mission retrouvé dans le dossier CCIC/DR5_RH et rendu sur une page ; modèle de paiement repris du tableau DR5 fourni précédemment. Les logos du modèle ne sont conservés que pour le client/programme correspondant. Génération fondée sur les données enregistrées, sans signature fabriquée. Calculs au centime et contrôle des affectations simultanées supérieures à 100 %.
6. **Tamponnage prestations / équipements** : lot sans document de paiement, projet et base HT/TTC explicites, taux de TVA par facture. Lecture des totaux, contrôle de cohérence et aperçu à valider avant tamponnage. Un total non reconnu peut être saisi après confirmation manuelle.
7. **Paramètres & données** : export ZIP administrateur avec sélection des sections, données et historiques en JSON, originaux et documents générés, inventaire et schémas. Flux vers le fichier local dans Chrome pour les grandes archives. Les mots de passe, jetons et secrets de connexion sont exclus.
8. **Identité** : favicon du triangle et manifeste d’installation actualisés, icônes ordinaires et maskables versionnées.

## Limites et points à vérifier par l’utilisateur

- Outlook officiel ne peut pas être intégré dans une iframe. Voir [la note de faisabilité](outlook-integre-faisabilite-2026-10-26.md). Le brouillon s’ouvre dans Outlook avec le compte personnel du salarié. Aucune intégration embarquée ni permission Mail.Send ajoutée.
- Le relevé doit comporter le travail effectué et les jours avant d’être joint ; aucune intervention n’est inventée. La confirmation d’envoi reste déclarative.
- Le parcours Microsoft Graph actuel accepte moins de 3 Mo de pièces au total. Au-delà, utiliser le fichier de message .eml (20 Mo maximum au total).
- Le mode sans document de paiement demande le montant à imputer sur chaque facture, même lorsqu’il est partiel, et contrôle qu’il ne dépasse pas le total HT ou TTC choisi. Une facture présentant plusieurs taux de TVA nécessite une répartition détaillée.
- Les marchés annuels doivent avoir un plafond HT et une base de réinitialisation cohérents. Si la date ou le plafond sont ambigus, l’application le signale au lieu de les inventer.
- Les affectations qui changent en cours de mois doivent être précisées avant la génération du paiement ; aucun prorata automatique n’est présumé.
- L’export ZIP lit les données successivement. Pour une photographie cohérente, lancer l’export en dehors des modifications simultanées.
- Les icônes déjà installées peuvent attendre le rafraîchissement du cache Chrome.

## Vérifications

Contrôle TypeScript et compilation. Tests des contrats, historique annuel et révisions, arrondis, droits, archives ZIP, concurrence, pièces jointes et conversion. Tests Python du rendu PDF et du tamponnage. Parcours navigateur sur données fictives : GED avec vrais DOCX/XLSX, Outlook avec relevé PDF, pièces amovibles et confirmation, tamponnage sans référence. Mode clair/sombre et petit écran vérifiés pour la GED ; documents générés relus visuellement. Sauvegarde de la base et du Worker avant migration additive des trois tables GED.

Sources initiales : 34fc8ef. Aucun changement de forfait ou de région d’hébergement.

## Précisions intégrées après publication

- Montant saisi directement pour chaque facture de prestations à tamponner, avec TVA distincte ; aucun montant d’imputation calculé automatiquement à partir du TTC. La lecture du total de la facture sert au contrôle. Les lots et PDF déjà traités ne sont pas recalculés.
- Trame de lettre remplacée par le modèle FRIHUB du dossier Marie-Fancoise FAGGIANELLI, commun à la lettre NEST4ESG. Nom du partenaire et logo en haut à droite issus de la fiche client, en priorité le logo importé. Le logo est conservé dans ses proportions. En l’absence de logo connu, aucun logo d’un autre client n’est repris. Affectation, projet, période, fonction et signataires viennent des données saisies. Original fourni préservé ; nouvelle trame dépersonnalisée.
- Vérifications : saisie obligatoire et montant partiel dans le parcours réel de tamponnage ; lettre d’un autre client avec logo personnalisé ; absence d’images d’un autre client/programme ; rendu Word sur une page.
