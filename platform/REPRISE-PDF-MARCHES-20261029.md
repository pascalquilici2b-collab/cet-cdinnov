# Corrections du 29 octobre 2026

## Travail demandé
- Restreindre le tampon RH aux pages du bulletin, exclure les annexes ; corriger les aperçus du lot de Paul Michel sans modifier les montants approuvés.
- Déplacer le tampon entre pages dans l’aperçu.
- Corriger l’aperçu PDF de l’éditeur et la fermeture PDF.js du lecteur IA.
- Libellé de suivi modifiable pour un devis finalisé, PDF archivé inchangé (confirmé par Pascal).
- Afficher et corriger le rattachement d’engagement depuis la facture, synchronisé avec le devis lié.
- Retirer les faux projets issus des titres de marchés ; compléter les logos identifiés auprès de sources publiques.
- Présenter les marchés par client dans une interface compacte.

## Validation et publication
- Tests ciblés PDF, tamponnage, API de suivi et plafonds d’engagement.
- Vérification dans le navigateur des parcours concernés.
- Publication Worker, site et moteur Render, puis contrôle public.
- Sources de production et sauvegardes dans `.private/pdf-markets-20261029/` (jamais commitées).

## Diagnostic initial
- Le lecteur commun appelait `PDFDocumentProxy.destroy`, supprimé dans PDF.js 6 ; la fermeture appartient à `PDFDocumentLoadingTask`.
- La recherche d’espace libre du tampon parcourait toutes les pages, y compris les annexes fiscales qui répètent l’en-tête du bulletin.
- Le déplacement à la souris était limité aux dimensions de la page de départ.

## Contrôles réalisés
- PDF.js 6 : fermeture via la tâche de chargement, coordonnées par transformation affine ; lecture d’un PDF de commande et aperçu A4 vérifiés dans Chrome.
- 78 tests Python réussis ; les six fichiers réels du lot Paul Michel sont redessinés sans changer leurs imputations ni leur base. Pages autorisées : bulletin uniquement, y compris lecture entièrement corrigée manuellement.
- Tests D1 de suivi : libellé sans modification du PDF, conflits de version, historique immuable, engagement commun à plusieurs factures, refus de dépassement cumulé.
- Tests existants `billing-test.mjs` et `billing-quote-test.mjs` encore obsolètes : attendent conversion sans engagement, conversion unique, absence de suppression et ancien contexte. Les parcours actuels sont couverts par `billing-partial-invoices-test.mjs`, `billing-order-budget-test.mjs` et les nouveaux tests.
- 17 logos officiels ajoutés aux projets ; seul le faux projet explicitement identifié a été retiré après contrôle d’absence de références. Sauvegarde privée des marchés avant modification.
- Retour vers factures/devis et avatar du compte connecté corrigés.
- Acquisition mensuelle : date de démarrage explicite par salarié, ajout de 2,5 jours au 1er novembre en calendrier Paris, contrôles simultanés et rattrapage sans doublon.
- Bulletin septembre de Matthieu vérifié : acquis disponibles 0 ; en cours 8,5. Les quatre autres chemins Moovapps ont disparu ; attente des fichiers permanents et confirmation du bulletin nommé janvier.

## À vérifier après publication
- Déploiements Pages/Worker/Render et correction des cinq aperçus Paul Michel encore sur annexes.
- Interface marchés par client, modification du suivi et déplacement entre pages.
