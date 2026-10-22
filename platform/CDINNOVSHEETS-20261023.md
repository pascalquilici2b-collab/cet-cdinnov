# CDInnovSheets et parcours facture — 23 octobre 2026

## Interface

- Smartsheet devient CDInnovSheets : déclinaison verte du triangle CDInnov, mot « Sheets » vert, favicon et écrans de connexion/chargement cohérents.
- Icônes distinctes pour budgets, facturation et feuilles. Protection du premier rendu contre le flash des icônes de thème.
- Tableau de bord : cartes avec indicateurs réels, activité sur sept jours et filtres de calendrier, adaptés au mode nuit et au mobile.
- Actions modifier/supprimer alignées à droite dans la liste des factures.

## Factures

- Le passage à Finalisé enregistre les modifications, fige le document et produit son PDF définitif. Les exports deviennent disponibles après cette opération.
- La finalisation PDF contrôle le contenu ordinaire du document. Les informations propres à la facturation électronique se complètent dans le convertisseur Factur-X existant.
- Le convertisseur reçoit le PDF archivé et les données natives, sans créer un doublon dans les factures importées. Ses métadonnées sont conservées dans le bloc administrateur `billingFacturx` du portail.
- Les données financières, le numéro et les dates d'une facture finalisée restent protégés pendant la conversion. Le fichier Factur-X peut ensuite être retéléchargé depuis cette fenêtre.
- Les anciens fichiers Factur-X archivés restent accessibles. Aucun dépôt automatique AGIRIS n'est ajouté.

## Services et contrôles

- Moteur PDF : nouveaux endpoints machine authentifiés `preflight-pdf` et `generate-issued-pdf`, profil `invoice-pdf`. Les endpoints électroniques stricts restent inchangés.
- Worker : vérification du hash du document et de l'enveloppe, du type du PDF et de son archive privée ; reprise possible après échec de génération.
- Aucun changement de forfait, de ressources ou de schéma de données requis.
- Contrôles : typage TypeScript, tests de réservation/immutabilité et de génération, parcours navigateur brouillon → finalisé → PDF → convertisseur réel, tests de branding clair/nuit/mobile, régression du tableau de bord, intégration locale Worker → Python → archive.
- Les émissions de test utilisent exclusivement des documents fictifs locaux. Les documents de production ne sont ni finalisés ni supprimés pour les essais.

## Limites à conserver

- Une session du convertisseur expirée peut demander une reconnexion.
- Le Factur-X reste à déposer manuellement sur AGIRIS.
- Une erreur dans le contenu financier déjà finalisé ne se corrige pas dans les métadonnées du convertisseur.
