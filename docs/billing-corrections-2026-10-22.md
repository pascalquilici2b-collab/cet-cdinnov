# Corrections de facturation — 22 octobre 2026

- Aperçu PDF : les annotations sont positionnées par rapport au canvas, sans décalage dû aux marges ni taille minimale imposée aux caractères. Vérification à 50 %, 75 %, 100 % et 125 %.
- Clients : le préremplissage recherche une fiche existante avant de créer, réutilise son identifiant et préserve ses contacts, notes et logo. Les établissements de SIRET différents restent distincts. Le serveur refuse les créations concurrentes d'un même SIRET.
- ADEC : son profil enregistré utilise déjà l'identifiant Budgets d'origine. Le SIREN et la dénomination officielle abrégée sont reconnus pour afficher son logo ; aucune fusion ni suppression de fiche n'a été nécessaire.
- Export PDF : bouton rouge avec pictogramme PDF, également pour le téléchargement Factur-X avant dépôt sur AGIRIS.
- Paiement : suppression des sélecteurs de moyen de paiement et d'exigibilité de TVA dans l'éditeur. Nouveaux documents et brouillons ouverts utilisent le virement. Les métadonnées fiscales et documents émis restent conservés. Conditions regroupées dans « Mentions de paiement » ; texte par défaut si les paramètres sont vides : « Règlement par virement bancaire à l’échéance indiquée sur la facture. »
- Projets : « ID du projet », programme modifiable, choix prédéfinis et saisie libre. Le programme du projet sélectionné est repris dans le document. Les bons de commande sont préservés.
- Tableau de bord : suppression de l'accroche et du titre demandés. Onglets commerciaux corrigés sur petits écrans.
- Notes de frais : le projet sélectionné reste conservé après le retour de l'aperçu PDF et le rechargement de la liste des projets.
- AGIRIS : action « Déposer sur AGIRIS », téléchargement du Factur-X puis dépôt et validation dans la plateforme. Aucune promesse d'API ni de transmission automatique. Aucun envoi réel réalisé lors des tests.

## Numérotation retenue

L'utilisateur a choisi « Référence commune visible + numéro comptable de facture ». Les devis suivent `AAAAMMJJ-001`, compteur quotidien. Les factures suivent `F-AAAAMMJJ-001`, avec un compteur continu qui ne repart pas à zéro chaque jour. Exemple : `F-20261022-001`, puis `F-20261023-002`. Les devis ne consomment aucun numéro de facture.

La facture créée depuis le devis accepté reprend son numéro dans « Référence devis », visible dans l'application et le PDF, et conserve le lien vers le devis et son instantané. La date de la nouvelle facture est celle de sa création, modifiable avant émission. Les numéros sont attribués à la finalisation, après contrôle préalable ; les brouillons n'en consomment pas. La réservation atomique et les protections des archives sont conservées. Aucune renumérotation des documents existants.

Sources : [numérotation des factures, BOFiP](https://bofip.impots.gouv.fr/bofip/140-PGP.html/identifiant%3DBOI-TVA-DECLA-30-20-20-10-20120912), [dépôt des factures émises, documentation AGIRIS](https://agiris.cecurity.com/demat/v2/help/docs/Factures-ventes/D%C3%A9p%C3%B4t).

## Vérifications

Build, TypeScript, tests des brouillons (17), répertoire D1 (8, dont concurrence SIRET), identité ADEC, clients dans le navigateur et responsive, aperçu PDF et zoom, projets et conservation des BC, programmes, conversion et envoi e-mail simulé. Tests complémentaires des compteurs quotidiens et continus, concurrence, reprise idempotente, refus d'antidatation, devis accepté/refusé ; tests Python du PDF et de préservation des anciennes empreintes. Aucun changement de forfait, ressources, région ou variables d'hébergement.

Publication : Worker sauvegardé puis remplacé en conservant toutes les liaisons et données métier ; frontend GitHub Pages. Preuves de livraison et sauvegardes privées sous `platform/.private/corrections-20261022b/release/` et `platform/.private/numbering-20261022/release/`. Le moteur PDF Render a été déployé séparément au commit `1c44d616b8ccfd69becd679b3a480dc23389aeca` et vérifié Live.
