# Documents RH — composants et intégration

L’interface réutilise les tokens Apple/CDInnov existants : typographie locale, fonds, couleurs sémantiques, thème sombre, boutons arrondis. Aucun téléchargement de police ou outil de suivi n’est ajouté.

Références consultées sur 21st.dev le 5 novembre 2026 :

- Minimal Button par radiumcoders : https://21st.dev/@radiumcoders/components/minimal-button (démo 13568). La hiérarchie et la texture très légère du bouton principal sont adaptées aux tokens CDInnov, avec un bouton HTML natif accessible.
- File Dropzone par Joyco : https://21st.dev/joyco/file-dropzone/default (démo 19201). Le modèle de dépôt/bouton de sélection, les états de survol, limites de fichiers et erreurs sont réimplémentés pour les PDF privés et l’API existante. Le hook tiers n’est pas embarqué.

Le module ne duplique pas les répertoires Clients ou Projets. Les créations d’agents et les liens de projets passent par les API communes. Les informations de paiement du service financier sont seulement importées et relues.
