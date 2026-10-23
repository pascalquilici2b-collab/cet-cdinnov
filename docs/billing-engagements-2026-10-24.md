# Facturation — engagements et relevés, 24 octobre 2026

## Fonctionnement livré

- Devis avant Factures, colonnes identiques et statuts Brouillon / Finalisé / Envoyé / Accepté.
- Après acceptation : joindre un bon de commande ou un devis signé (PDF/PNG/JPEG, 10 Mo), préciser sa référence, sa date, son montant HT et son rattachement. La création de la facture est ensuite disponible depuis la liste.
- La pièce reste archivée une seule fois dans R2 privé. La facture reprend le projet, le marché et le bon de commande. La vue « Projets liés » du marché affiche également cet engagement.
- « Suivi engagement » : montants facturés par engagement reçu ; montants des devis envoyés/acceptés par marché, comparés au maximum contractuel. Les brouillons ne consomment pas de commande. Les deux bases ne sont pas additionnées. Les factures historiques ne sont affectées que par des références explicites et non ambiguës.
- Relevé indépendant accessible dans la liste des factures et dans leur aperçu : objet, date, périodes multiples, prestations, travail réalisé, jours et certification. Les enregistrements du relevé sont versionnés sans modifier la facture archivée.
- Outlook : copie cachée cdi@cdinnov.com pour toute facture, depuis le compte individuel du salarié, et mention de l’envoi électronique dans le message par défaut. Le bouton prépare un brouillon ; il ne déclenche pas l’envoi.
- PDF : numéro au-dessus de la date, suppression de « Document émis », prestations réduites d’un point, remise uniquement dans les totaux lorsqu’elle existe. Devis sans paiement/coordonnées bancaires, avec la mention d’acceptation demandée et son cadre de signature. Description facultative sélectionnable depuis le catalogue.
- Marchés : « Projets liés » et « Informations diverses » regroupant les anciennes périodes et conditions. Leur citation documentaire n’est plus exigée ; les informations déjà enregistrées sont conservées.
- Factures natives : suppression réversible depuis la liste ou l’aperçu ; restauration par le filtre Corbeille. Le numéro, le PDF, les encaissements et la consommation restent conservés. La corbeille ne constitue pas une annulation comptable.

## Données et validation

Tables ajoutées : `billing_quote_engagements`, `billing_intervention_reports`, `billing_intervention_report_versions`. Le déclencheur de corbeille accepte les factures finalisées ; aucune suppression physique de document n’est introduite.

Tests : `platform/billing-support-test.mjs`, `platform/billing-support-ui-test.mjs`, `platform/billing-microsoft-draft-test.mjs`, tests Python `test_billing_support.py`, `test_quote_periods.py`, `test_billing_issuance.py`, compilation TypeScript et build des sept modules, y compris tamponnage.

Les contrôles navigateur utilisent une base locale éphémère, des documents fictifs et un moteur PDF local. Aucun envoi ni aucune émission de facture réelle ne sont nécessaires. Les PDF déjà finalisés en production restent leurs originaux archivés : les nouvelles mises en page s’appliquent aux prochains documents générés.

## Reprise et exploitation

Scripts privés : `platform/.private/support-release.mjs` (sauvegarde, migration, Worker), vérifications et preuves dans `platform/.private/billing-support-20261023/`. Conserver ces fichiers privés hors Git ; ils contiennent les sauvegardes de production.

Publication du moteur PDF via le service Render existant, puis du Worker et de l’interface GitHub Pages. Préserver le module de tamponnage, ses liaisons et ses files de tâches. Aucun forfait, région ni ressource d’hébergement modifié.

Limites : les anciens bons sans montant ou sans lien explicite ne peuvent pas avoir un pourcentage fiable ; leur montant/rattachement doit être renseigné. Le dépôt AGIRIS reste manuel avec le Factur-X téléchargé, selon l’absence d’API annoncée par AGIRIS. Chaque salarié doit connecter son propre Outlook pour créer un brouillon Microsoft 365.
