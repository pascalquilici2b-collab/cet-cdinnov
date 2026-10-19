# Interface inspirée du guide Apple fourni

`reference-apple.md` contient la référence fournie par CDInnov. Elle remplace les choix graphiques du précédent design system pour l’interface de gestion. Il s’agit d’une adaptation au produit, sans dépendance à un kit Apple propriétaire.

- Police système Apple sur macOS/iOS ; Inter sous licence OFL, déjà hébergée dans l’application, sur les autres systèmes. Aucun téléchargement Google Fonts ou licence payante.
- Fonds blanc cassé, textes sobres, actions bleues, cartes à rayon de 18 px et boutons arrondis. Les tableaux gardent la densité utile à la saisie.
- `tokens.css` définit les couleurs sémantiques. `apple.css` complète les adaptations du portail, de Budgets et de Smartsheet. Les couleurs neutres des sources des deux applications utilisent ces variables.
- `platform/client/theme.ts` applique le thème avant l’affichage. Le choix est mémorisé sous `cdinnov-color-scheme`, suit sinon le système et se synchronise entre onglets et iframe Budgets de même origine. Le bouton se trouve en bas du menu et indique son état aux lecteurs d’écran.
- Les couleurs métier et les couleurs choisies dans les cellules et widgets sont conservées. Le contraste du texte hérité d’un widget personnalisé tient compte de son fond.
- Les portraits du tableau de bord réutilisent la source de l’agenda ; les initiales restent disponibles en cas d’image absente ou inaccessible. Aucun portrait n’est ajouté aux réponses serveur ni dupliqué dans la base.

Vérifications visuelles locales dans les deux thèmes, sur ordinateur et téléphone, et contrôles de débordement, d’icônes, de clavier et de persistance du thème. Aucun enregistrement réel n’est nécessaire pour tester l’interface.
