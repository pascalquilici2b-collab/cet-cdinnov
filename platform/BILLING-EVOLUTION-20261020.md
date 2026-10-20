# Évolution facturation du 20 octobre 2026

Demande autorisée : enrichir les clients, fixer l'identité CDINNOV et son RIB, compacter l'éditeur en étapes validables, relier marchés/projets/bons de commande, constituer un catalogue fondé sur les pièces existantes, tester et publier.

## Ordre de réalisation

1. Lire le devis Word fourni, le RIB et les factures disponibles. Conserver les sources privées ; utiliser le logo actuel.
2. Ajouter les données juridiques aux clients, leur provenance et les champs de modification. Vérifier les réponses publiques réelles. Ne pas inventer un numéro TVA ou un représentant légal à partir d'un nom de dirigeant sans fonction.
3. Préparer les paramètres CDINNOV côté serveur et les prestations documentées, sans réécrire les factures existantes.
4. Ajouter les projets et bons de commande aux marchés, conserver leur historique et lier les références des brouillons.
5. Refaire les étapes Votre document, Client, Prestations, Paiement, Affaire et références : validation explicite, résumé replié, bouton Modifier, icônes, coches bleues accessibles et mouvement réduit.
6. Harmoniser le logo et le pied de page dans l'aperçu et le moteur PDF. Masquer l'émetteur, le RIB et le mode de facturation dans la saisie courante ; les paramètres restent administrables.
7. Vérifier les contrats de données, sauvegardes, parcours navigateur, formats mobiles et PDF. Sauvegarder avant publication ; publier serveur et interface compatibles, puis contrôler les fichiers servis et les écritures autorisées.

## Contraintes

- Aucune émission de facture réelle ni transmission à AGIRIS dans cette livraison.
- Pas de remplacement des paramètres utilisateur ni de modification des documents définitifs à leur lecture.
- Les valeurs manquantes de la source restent vides et modifiables.
- Un tarif provenant d'un contrat particulier ne devient pas automatiquement le tarif universel.
- Le rattachement conserve un instantané lisible des références dans le document.
- Les secrets et documents d'entreprise restent hors des ressources publiques.

## État

Implémentation et contrôles terminés. Branche `codex/billing-refonte-20261019`, base `c4b7781`. Serveur publié et relu à l’identique ; paramètres CDINNOV et 16 prestations enregistrés. L’interface est livrée par cette branche sur `main` ; la preuve des fichiers servis est conservée dans le dossier privé de publication.

- Clients : forme juridique INSEE, noms/fonctions des représentants déclarés et TVA DGFiP depuis la réponse publique. Pas de dates de naissance conservées. Si plusieurs TVA sont retournées, choix explicite ; aucune clé TVA calculée.
- Le capital social n'est pas fourni par cette API. Champ éditable, laissé vide lorsque la source est absente, explication en info-bulle.
- Source vérifiée : [API Recherche d’entreprises](https://recherche-entreprises.api.gouv.fr/docs/), requête minimale incluant `siege,matching_etablissements,dirigeants,tva`. Réponse réelle 200 avec CORS autorisé, forme juridique, deux représentants et TVA pour CDINNOV.
- Nomenclature des 260 formes juridiques : [INSEE, catégories juridiques](https://www.insee.fr/fr/information/2028129), fichier de septembre 2022, conversion locale en JSON.
- Identité CDINNOV issue du devis fourni et recoupée avec l'annuaire. IBAN du RIB fourni vérifié par son contrôle modulo 97, conservé exclusivement dans les paramètres privés.
- Catalogue : 16 prestations issues des devis VIAMARE/BESTREAMPOWER, factures et relevés AMO CCI/CMARC, devis de montage OEC et communication FEAMPA. Tarifs laissés à préciser, car les tarifs journaliers observés sont propres aux contrats.
- Marchés : projets et bons de commande, pièces rattachées au marché, archivage et conservation des références historiques. Les anciens clients API qui omettent les projets ne les effacent pas.
- Éditeur : cinq étapes, validation explicite, résumé, crayon de réouverture, coches bleues, mouvement réduit. Identité et banque copiées depuis les paramètres à la création ; aucun document existant réécrit.
- Logo actuel et mentions en pied de page dans l'aperçu et le moteur PDF. Exemple simple de devis tenu sur une page, longues désignations et pagination vérifiées.

## Vérifications et reprise

Preuves et sources privées dans `platform/.private/evolution-20261020/` : sources extraites, catalogue et paramètres préparés, captures ordinateur/mobile clair/sombre, PDF synthétique et sauvegardes de publication. Ne jamais ajouter ce dossier à Git.

Contrôles : TypeScript, build, tests annuaire, répertoire D1, contrats Python/TypeScript et Factur-X, tests marchés, nouveau parcours navigateur `billing-evolution-test.mjs`, 14 tests du moteur PDF. Le parcours navigateur vérifie les informations juridiques, les cinq étapes, la correction après repli, la persistance et les liens parent/enfant.

La chaîne native PDF/émission reste conditionnée au déploiement du moteur distant et à son raccordement (voir `BILLING-RELEASE-V1.md`). Le code et le rendu local sont prêts ; ne pas présenter le contrôle local comme une activation en production. Le convertisseur Factur-X historique est préservé.

PISTE : d'après les vérifications antérieures de cette conversation, abonnement Annuaire G2B sandbox accepté et OAuth validé, accès métier encore bloqué par l'absence de compte Chorus Pro de qualification. AGIRIS : accès d'intégration contractuel à obtenir. Ces accès ne conditionnent pas le préremplissage public des clients.
