# ADR-0002 : Identité commune et compatibilité des sessions

**Statut : accepté dans le cadre de la migration progressive demandée.**
**Date : 19 octobre 2026.**
**Responsable fonctionnel : CDInnov.**

## Contexte

Les interfaces sont largement reprises en React/TypeScript, mais la connexion des API récentes était encore incorporée au serveur JavaScript historique. Les comptes et données doivent être conservés, sans nouvel abonnement.

## Décision

Extraire le protocole challenge/preuve, la vérification des jetons et la liste actuelle des administrateurs dans `platform/identity.ts`, en mode strict. Tous les appelants de l’entrée serveur maintenue utilisent cette implémentation. Conserver la route et les audiences cryptographiques antérieures ; ajouter une route commune de connexion et de lecture de l’identité.

La reprise du portail global reste un lot distinct qui inclut les comptes, les écritures, les pièces et la fermeture des anciennes voies. Aucun compte, fichier ou document métier ne change de stockage dans cette tranche.

## Options et compromis

| Option | Complexité | Coût ajouté | Conséquence |
|---|---|---|---|
| Extraction progressive dans Workers | Modérée | Aucun service ajouté | Réutilise protocole, comptes et bases ; maintient temporairement les accès historiques |
| Nouveau fournisseur d’identité | Plus élevée pour cette bascule | Dépend de son offre | Fonctions d’identité supplémentaires, mais migration des comptes et intégrations |
| Réécriture complète du portail en une livraison | Élevée | Aucun abonnement nécessairement | Bascule simultanée des comptes, imports, fichiers et écritures |

L’extraction fournit une base testable sans doubler les sources de comptes. Elle ne clôture pas la migration des droits.

## Conséquences

- Les clients et jetons existants restent compatibles ; mots de passe et données sont conservés.
- La réponse d’identité contient seulement le compte connecté, sans secret ni comptes tiers.
- Expiration, audience et champs sont vérifiés strictement ; challenges à usage unique et limites IP/adresse conservés.
- Une lecture de session nécessite un accès KV, aucune écriture D1 ni appel IA. Aucun polling n’est ajouté.
- La révocation dépend de la visibilité des modifications dans KV. La déconnexion locale ne révoque pas un jeton déjà copié.
- Les rôles sont encore les correspondances historiques ; les anciennes routes du portail et des pièces restent prioritaires.

## Validation et actions

1. [x] Construction du Worker complet et contrôle TypeScript.
2. [x] Tests des deux routes, des sessions antérieures, des droits existants, expiration, rejeu, concurrence et limites.
3. [x] Connexion navigateur, rechargement, profils, déconnexion et réponse tardive.
4. [ ] Reprise du chargement initial, des comptes et pièces avec des API filtrées.
5. [ ] Sessions révocables côté serveur et modèle de rôles explicite.
6. [ ] Fermeture des anciennes voies après recette et plan de retour arrière.
