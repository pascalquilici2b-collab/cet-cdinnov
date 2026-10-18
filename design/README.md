# Charte CDInnov dans les applications

La référence fournie le 19 octobre 2026 est conservée dans `brand/`. Les logos et la police Manrope sont servis sur le domaine de l'application. `tokens.css` reprend les variables de la charte, sans les classes éditoriales génériques susceptibles d'entrer en conflit avec les écrans existants. Les trois adaptations sont `portal.css`, `budgets.css` et `sheets.css`.

Les interfaces de gestion conservent une densité adaptée : titres fluides de 26–38 px, textes et champs lisibles, actions tactiles de 40–44 px, icônes de 18–24 px. Les couleurs d'état, de catégories budgétaires et les trois repères d'applications restent distincts, conformément aux usages métier et à la demande de navigation. Les couleurs choisies dans les cellules Smartsheet ne sont pas remplacées. Les tableaux financiers et les chronogrammes gardent leur défilement dans leur propre zone.

La bibliothèque typée `platform/client/icons.ts` sert les actions historiques et les pictogrammes officiels. Chaque SVG a une largeur, une hauteur et `aria-hidden`. `icon.tsx` fournit le composant React correspondant. Les SVG de graphiques, logos et signatures ne sont pas redimensionnés par cette règle.

## Exploration 21st

Références examinées le 19 octobre 2026 :

- [Sidebar, shadcn/ui](https://21st.dev/@shadcn/components/sidebar) : groupes de navigation, actions compactes et état actif. Licence MIT indiquée sur la fiche, confirmée par [la licence du projet](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md).
- [Pagination, Origin UI](https://21st.dev/@originui/components/pagination/with-ghost-buttons) : actions précédent/suivant, icônes à dimensions explicites et états désactivés.
- [Catalogue navigation](https://21st.dev/community/components/navigation) : comparaison des onglets, menus et barres latérales. Les éléments décoratifs animés n'ont pas été retenus pour les tableaux de travail.

Choix : adapter les composants shadcn/Radix déjà utilisés par Budgets et les composants existants du portail. Aucun abonnement 21st, générateur payant ou service d'IA n'est nécessaire. Aucune nouvelle copie de composant communautaire n'est embarquée. Les notices des composants shadcn récupérés sont dans `apps/budgets/components/LICENSE.md`. La licence de Lucide figure dans `LUCIDE-LICENSE.txt` et celle de Manrope dans `brand/fonts/OFL.txt`.

## Migration et conservation

Les sources React/TypeScript nécessaires à Budgets sont désormais dans `apps/budgets`, reconstruites avec Vite dans `budgets-projets/`. `source-manifest.json` contient les empreintes au moment de la récupération ; les évolutions ultérieures sont suivies par Git. La liaison avec les sessions, le contrôle de version, les documents, les importations et les exports sont conservés. Les anciens fichiers compilés restent disponibles pour les onglets déjà ouverts.

Smartsheet conserve son moteur React publié dans `feuilles/assets/`. Cette étape harmonise ses écrans par une feuille de style maintenable, sans réécrire son moteur compilé ni modifier son format de données. La reprise complète de ses sources originales reste une étape distincte.

Les bases, le Worker, les bindings et les contrats d'API sont inchangés. Les tests de navigateur utilisent des jeux de données isolés et bloquent les appels externes non simulés. Aucun jeu de données de production ni sauvegarde privée ne doit être placé dans ce dépôt.

## Construire et vérifier

`pnpm install --frozen-lockfile`, `pnpm build`, `pnpm build:budgets`, `pnpm typecheck`, `pnpm typecheck:budgets`. Définir `PORTAL_QA` vers un dossier privé, puis exécuter `node platform/applications-browser-test.mjs` et les tests de régression du portail. Les fichiers OCR déjà publiés sous `budgets-projets/ocr/v7` sont conservés ; la lecture PDF, Excel et OCR fonctionne dans le navigateur, sans serveur payant.
