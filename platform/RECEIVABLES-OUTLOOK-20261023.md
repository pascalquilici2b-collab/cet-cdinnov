# Factures et Outlook — 23 octobre 2026

## Fonctionnement livré

- Échéance proposée à J+30 calendaires pour les nouvelles factures, les duplications et les conversions de devis. Modifier la date de facture recalcule l’échéance ; une échéance spécifique reste saisissable. Les documents définitifs existants ne sont pas réécrits.
- Une facture finalisée sans encaissement reste « Finalisé » jusqu’à la date d’échéance incluse. Dès le lendemain, son solde non encaissé affiche « En retard d’encaissement ». Le calcul est fait à la lecture et actualisé dans l’interface au changement de jour à Paris. Aucun traitement planifié nécessaire.
- Statuts cohérents dans la liste, le filtre, le sélecteur et le détail : bleu pour Finalisé, orange pour le retard, vert avec billet pour Réglée. Bouton d’enregistrement du paiement vert avec billet. Même calcul pour les anciennes factures importées.
- « Rectifier la facture », à côté de Dupliquer, exige la confirmation de non-transmission. La facture d’origine et son PDF sont conservés ; une copie liée avec un nouveau numéro s’ouvre dans l’éditeur. L’original est écarté du suivi d’encaissement tant que la rectification est active. Supprimer le brouillon réactive l’original. La reprise est interdite après un mouvement de paiement ou un envoi enregistré.
- Fenêtre Outlook adaptée aux modes clair/sombre et aux petits écrans, icône Outlook, téléchargement du message par icône seule, pièce jointe PDF rouge et blanche. Le texte proposé reprend le numéro, le projet et le semestre ; il reste modifiable.

## Limite connue

L’application ne sait pas détecter un envoi manuel réalisé hors de l’application (Outlook, AGIRIS ou autre). La confirmation de non-transmission engage l’utilisateur sur ce point. La création d’un brouillon Outlook ne vaut pas envoi. Chaque collaborateur conserve son propre compte Microsoft ; aucun message n’est envoyé automatiquement.

## Vérifications

- TypeScript, compilation et contrôle des différences.
- Tests API D1 : date +30, états aux limites d’échéance, filtres, rectification concurrente/idempotente, édition du remplacement, conservation de l’original et du PDF, exclusion du double encaissement, restauration refusée après paiement.
- Tests des paiements, du suivi des devis, de leur conversion et de la corbeille.
- Liste fusionnée : pagination de 232 documents, filtres des factures importées avant/après échéance.
- Navigateur isolé + moteur PDF réel : impression A4, préparation .eml et brouillon Microsoft simulé avec PDF identique, modèle de message, modes clair/sombre/mobile, rectification puis nouvelle finalisation sans modification de l’original. Aucun e-mail ni document réel créé par les tests.

## Publication

Migration additive `billing-rectification-schema.mjs`, puis Worker `cet-data`, puis interface via la branche distante `main`. Sauvegardes privées du Worker, de sa configuration et des tables existantes dans `.private/receivables-outlook-20261023/release/`. Aucun changement de forfait ou de ressources d’hébergement. Moteur PDF inchangé.
