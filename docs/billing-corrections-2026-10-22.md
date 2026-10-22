# Corrections de facturation — 22 octobre 2026

- Aperçu PDF : les annotations sont positionnées par rapport au canvas, sans décalage dû aux marges ni taille minimale imposée aux caractères. Vérification à 50 %, 75 %, 100 % et 125 %.
- Clients : le préremplissage recherche une fiche existante avant de créer, réutilise son identifiant et préserve ses contacts, notes et logo. Les établissements de SIRET différents restent distincts. Le serveur refuse les créations concurrentes d'un même SIRET.
- ADEC : son profil enregistré utilise déjà l'identifiant Budgets d'origine. Le SIREN et la dénomination officielle abrégée sont reconnus pour afficher son logo ; aucune fusion ni suppression de fiche n'a été nécessaire.
- Export PDF : bouton rouge avec pictogramme PDF, également pour le téléchargement Factur-X avant dépôt sur AGIRIS.
- Paiement : suppression des sélecteurs de moyen de paiement et d'exigibilité de TVA dans l'éditeur. Nouveaux documents et brouillons ouverts utilisent le virement. Les métadonnées fiscales et documents émis restent conservés. Conditions regroupées dans « Mentions de paiement » ; texte par défaut si les paramètres sont vides : « Règlement par virement bancaire à l’échéance indiquée sur la facture. »
- Projets : « ID du projet », programme modifiable, choix prédéfinis et saisie libre. Le programme du projet sélectionné est repris dans le document. Les bons de commande sont préservés.
- Tableau de bord : suppression de l'accroche et du titre demandés. Onglets commerciaux corrigés sur petits écrans.
- AGIRIS : action « Déposer sur AGIRIS », téléchargement du Factur-X puis dépôt et validation dans la plateforme. Aucune promesse d'API ni de transmission automatique. Aucun envoi réel réalisé lors des tests.

## Point à décider

La numérotation n'est pas modifiée dans cette livraison. L'utilisateur demande désormais un numéro strictement commun au devis et à la facture. La proposition « référence de devis commune affichée + numéro comptable de facture distinct » est soumise à clarification, pour préserver une séquence chronologique continue des factures lorsque des devis sont refusés ou acceptés dans un ordre différent.

La conversion existante conserve déjà le lien vers le devis et son instantané. Ne jamais renuméroter un document émis, modifier son historique ou consommer un numéro par un simple enregistrement de brouillon.

Sources : [numérotation des factures, BOFiP](https://bofip.impots.gouv.fr/bofip/140-PGP.html/identifiant%3DBOI-TVA-DECLA-30-20-20-10-20120912), [dépôt des factures émises, documentation AGIRIS](https://agiris.cecurity.com/demat/v2/help/docs/Factures-ventes/D%C3%A9p%C3%B4t).

## Vérifications

Build, TypeScript, tests des brouillons (17), répertoire D1 (8, dont concurrence SIRET), identité ADEC, clients dans le navigateur et responsive, aperçu PDF et zoom, projets et conservation des BC, programmes, conversion et envoi e-mail simulé. Aucun changement de forfait, ressources, région ou variables d'hébergement.

Publication : Worker sauvegardé puis remplacé en conservant toutes les liaisons et données métier ; frontend GitHub Pages. Preuves de livraison et sauvegarde privées sous `platform/.private/corrections-20261022b/release/`.
