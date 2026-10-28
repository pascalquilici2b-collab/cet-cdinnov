# Revue croisée indépendante — frontend, CSV et Microsoft Graph

Revue effectuée par le reviewer identité/accès le 28 octobre 2026. Sources examinées : modifications de `billing-microsoft-draft.ts`, `portal-compat.js`, `index.html`, `csv-export.ts`, exports Budgets et Sheets, tests de sécurité et de brouillons/envoi Microsoft. Aucun compte externe, aucune session réelle et aucun message réel utilisés.

## Défaut supplémentaire trouvé puis corrigé

La première version de `csvCell` appliquait la neutralisation uniquement quand `typeof value === 'string'`, mais sérialisait ensuite toute valeur avec `String(value)`. Un tableau JSON `['=1+1']` produisait ainsi une cellule encore interprétable comme formule. Plusieurs champs Budgets/portail ne sont pas typés strictement côté serveur, donc le cas ne pouvait pas être exclu par les types TypeScript.

Le reviewer frontend a corrigé l’utilitaire partagé et la copie classique pour protéger le texte sérialisé de toute valeur sauf les véritables nombres. Les cas de tableau simple et précédé d’une tabulation sont ajoutés aux tests. Le stockage métier n’est pas modifié.

## Résultats de la revue

- Graph : la vérification porte sur la frontière `/me` puis sur le chemin normalisé. Les origines et routes sont construites dans le code, les identifiants de messages sont encodés ; pas de nouveau paramètre de route arbitraire exposé à un utilisateur identifié.
- Pièces privées : l’allowlist client refuse les schémas actifs, les données HTML/SVG, les origines étrangères et les identifiants dans l’URL. Les fichiers de l’origine configurée restent chargés avec le porteur puis convertis en Blob ; les données PDF/images classiques restent utilisables. La validation à la lecture protège les anciens dossiers laissés inchangés par le serveur.
- Rendus classiques : `inlineArg` sérialise une vraie chaîne JavaScript avant l’échappement HTML. Le décodage des entités par le navigateur conserve donc un argument et ne réintroduit pas de fermeture de chaîne. Les changements contrôlés sont limités aux arguments de gestionnaires et à des attributs/textes ; aucune suppression de contrôle métier observée.
- CSV : titres de colonnes et cellules utilisent le même utilitaire, les guillemets CSV restent doublés et les nombres restent des nombres. Le contournement par tableau est corrigé. Les formules XLSX explicites ne sont pas alimentées par les libellés utilisateur examinés.

Commande de contrôle exécutée indépendamment après la dernière correction :

```powershell
node --test platform/security-audit-20261028/frontend-security-test.mjs platform/billing-microsoft-draft-test.mjs platform/billing-microsoft-send-test.mjs platform/billing-microsoft-send-testmail-test.mjs
```

Résultat : **20/20 tests réussis**. Le contrôle TypeScript global `tsc -p platform/tsconfig.json` passe également après les dernières modifications de validation portail.

**Verdict : favorable sur ce périmètre après correction du contournement CSV par tableau.** Aucun problème bloquant supplémentaire confirmé dans les changements relus. Ce verdict ne constitue pas un test réel du tenant Microsoft ni une preuve d’absence de toute XSS dans l’ensemble du produit ; les limites de parcours des anciennes fonctions HTML sont explicitement documentées dans le rapport frontend.
