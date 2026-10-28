# Infrastructure, dépendances et livraison

Audit du 28 octobre 2026, depuis la révision 531ea21. Les contrôles publics sont passifs et bornés. Les scénarios de modification utilisent exclusivement les bases locales fictives.

## Architecture observée

Interfaces : GitHub Pages, domaine app.cdinnov.eu. API et identité : Cloudflare Worker, D1 et R2. PDF, Factur-X et OCR : service Docker Render. IA : Workers AI. Messagerie : Microsoft Graph avec droits délégués individuels. Les serveurs DNS sont ceux de Hostinger et le sous-domaine app pointe sur GitHub Pages.

Les neuf routes privées examinées sans authentification (session, portail, facturation, projets, tamponnage, export, fichiers, budgets, Sheets) répondent 401. Une origine étrangère reçoit 403. Le moteur PDF déclare son authentification obligatoire et son état prêt. Aucun envoi Outlook ni traitement de pièce client n'a été déclenché.

## Dépendances

- Audit initial pnpm : 36 avis dans l'arbre principal, dont 12 élevés. Ce sont des avis de dépendances, pas 36 exploitations démontrées dans l'application.
- Le manifeste marchés et ses dépendances sont désormais inclus dans le même verrouillage pnpm. Cela a aussi identifié PDF.js 5.6.205, corrigé en 6.3.289, et permis d'auditer les outils secondaires.
- SheetJS est passé de l'ancien paquet npm 0.18.5 à la distribution officielle 0.20.3, verrouillée avec son intégrité. Le script de lecture Excel du portail est maintenant local. L'ancien PDF.js chargé depuis un CDN a été remplacé par le lecteur local corrigé.
- esbuild, Vite et les dépendances transitives concernées (undici, sharp, uuid) sont actualisés. Le build du lecteur copie systématiquement la version PDF.js verrouillée et ses ressources ; l'ancien chemin vers un runtime global a été retiré.
- Résultat pnpm après intégration des deux manifestes : aucun avis connu dans l'arbre verrouillé de 496 dépendances.
- OSV : les 37 versions Python verrouillées sont vérifiées. certifi, Pillow et pypdf ont été actualisés ; aucune alerte connue ne subsiste dans ce contrôle.

Les avis de référence incluent [PDF.js](https://github.com/advisories/GHSA-hq66-cqwq-w95j), [SheetJS prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [SheetJS ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9). La [distribution SheetJS officielle](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) est distincte de l'ancien paquet npm.

## Surface publique

Les scans ciblés du contenu courant et de 2 021 objets texte de l'historique n'ont trouvé aucune clé fournisseur, clé privée ou vérificateur de compte correspondant aux motifs examinés. Ce contrôle par motifs ne détecte pas toute forme possible de secret. Un ancien fichier UUID de l'accès historique fermé a été retiré de la publication ; son historique n'a pas été réécrit.

Les trois modèles Office publics ont été inspectés. Une métadonnée nominative du modèle Excel a été supprimée, sans modifier les autres composants. Aucune macro, relation externe ou pièce embarquée détectée. Les placeholders et logos attendus des lettres de mission sont conservés.

## Protections du navigateur

Le portail reçoit une politique CSP avec des origines explicites pour les appels de service, sans scripts exécutables de CDN ni évaluation de chaînes JavaScript. Le lecteur OCR/PDF conserve WebAssembly. Les gestionnaires classiques et le convertisseur embarqué nécessitent encore les scripts inline sur le portail. Sheets, budgets et callback Outlook conservent une politique stricte de scripts locaux. La politique Referrer est no-referrer.

Un garde placé avant les contrôles masque l'application lorsqu'un site étranger l'intègre dans une iframe. Le navigateur confirme le refus et le fonctionnement des modules intégrés de même origine. Il s'agit d'un complément applicatif : GitHub Pages ne fournit pas ici les en-têtes personnalisés HSTS, frame-ancestors, nosniff et Permissions-Policy. Une balise meta ne remplace pas frame-ancestors ([spécification expliquée par MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)). Aucun fichier _headers sans effet n'a été présenté comme une correction.

L'API Cloudflare ajoute HSTS, Referrer-Policy et une CSP fermée, en plus de no-store, nosniff et du contrôle CORS existant. Le moteur Render dispose déjà d'une CSP fermant l'intégration par iframe, de nosniff et de no-referrer.

## Validation et limites

Les builds plateforme, budgets, Sheets et lecteur de marchés passent. Le navigateur local valide la vraie connexion PBKDF2/HMAC, les budgets intégrés, Sheets, un PDF de deux pages, son aperçu canvas, le convertisseur Factur-X, le callback et les appels Microsoft simulés : aucune erreur ni violation CSP inattendue. La politique stricte de Sheets refuse un nouveau script inline ; le garde interdit les contrôles sous un parent étranger.

La revue indépendante des changements Graph, URL et CSV est favorable. L'ajout des extensions de modules TypeScript permet aussi l'exécution directe des tests Node 24. Les tests historiques de facturation et d'identité ont été remis en cohérence avec les migrations et droits actuels, sans retirer leurs assertions métier.

Les paquets natifs de l'image Linux et les politiques des comptes d'hébergement/Microsoft ne sont pas assimilés au résultat pnpm/OSV. Docker est absent du poste ; les tests natifs et limites Linux sont obligatoires dans le build Render. Le contrôle de l'image effective et sa publication sont consignés dans le rapport de livraison. Aucun changement de forfait, de DNS ou de droits Microsoft n'est effectué.

À maintenir : contrôles réguliers des dépendances, sauvegardes administrateur privées, renouvellement des mots de passe si un ancien challenge a été exposé, et future politique HTTP complète lorsque l'hébergement des pages permettra ces en-têtes. Le jeton applicatif reste accessible au JavaScript du même domaine ; les protections XSS sont donc indispensables.
