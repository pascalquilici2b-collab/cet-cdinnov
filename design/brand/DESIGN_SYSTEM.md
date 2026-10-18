# Design system CDInnov

Source : www.cdinnov.eu (feuilles de style du site, octobre 2026). Ce document est la référence unique pour toute interface, page ou document aux couleurs de CDInnov.

## Mode d'emploi pour un agent de code

1. Charger `tokens/tokens.css` puis `components/components.css`. Ne jamais recopier une valeur en dur : utiliser les variables CSS (`var(--ink)`, `var(--cyan)`, `var(--radius-button)`…).
2. Poser `data-theme="light"` (défaut) ou `data-theme="dark"` (bleu nuit) sur `<html>` ou sur un conteneur.
3. Envelopper l'interface dans un élément `.cdi-root` puis réutiliser les classes `cdi-*` décrites plus bas. Exemples complets dans `components/examples/`.
4. Styles de texte : classes `.display`, `.section`, `.body`, `.micro`… générées dans `tokens.css`.
5. Logo : fichiers de `assets/logos/`, jamais redessiné. Pictogrammes : tracés de `assets/icons/`, à intégrer en SVG en ligne avec `stroke="currentColor"`.
6. Respecter les contrastes indiqués dans les notes d'usage : petit texte cyan seulement sur `paper` ou `surface`.

## Arborescence

```
tokens/tokens.json        jetons (source de vérité)
tokens/tokens.css         variables CSS, @font-face, classes de texte
components/components.css classes des composants (cdi-*)
components/examples/      une page HTML autonome par composant
assets/logos/             logo couleur et monochrome (SVG)
assets/icons/             16 pictogrammes au trait (SVG 24x24)
assets/images/            image de partage (PNG 1200x630)
fonts/                    Manrope Variable (woff2, graisses 200 à 800)
```

## Charte

Système graphique de CDInnov, cabinet de conseil indépendant en projets européens et développement territorial (Bastia, Marseille). Il reprend les valeurs du site www.cdinnov.eu : une mise en page éditoriale, claire, bleu encre sur fond presque blanc, avec un seul accent cyan.

### Principes

- Éditorial avant tout : de grands titres légers, beaucoup d'air, des filets fins plutôt que des cadres ou des ombres.
- Un seul accent. `cyan` signale ce qui est actif, survolé ou à retenir. Tout le reste est en `ink` et `muted`.
- Formes quasi angulaires : `radius-button` (2px) et `radius-field` (3px). Les pastilles (`radius-pill`) sont réservées aux filtres et interrupteurs.
- Pas de dégradé, d'encadré coloré ni d'ombre décorative dans les mises en page. Les dégradés n'existent que dans le logo.

### Ton et rédaction

- Vouvoiement, adressé au porteur de projet : « vos projets européens », « Parlons de votre projet ».
- Le cabinet parle à la première personne du pluriel : « nous accompagnons », « nous croisons les disciplines ».
- Titres en phrases nominales ou verbales courtes, ponctuées d'un point, souvent en série de trois : « Comprendre. Connecter. Agir. », « Conseil. Développement. Innovation. », « Voir plus loin. Agir ensemble. »
- Un verbe à l'infinitif résume chaque métier : « Faire émerger. », « Tenir le cap. », « Sécuriser. », « Lire les possibles. », « Éclairer l'action. »
- Vocabulaire du métier, sans jargon inutile : candidature, partenariats, livrables, indicateurs, comités de pilotage, contrôles, JEMS, chef de file.
- Capitalisation à la française : majuscule initiale seulement (« Nos champs d'intervention »). Les capitales intégrales sont réservées au style `micro`.
- Esperluette admise dans les intitulés de métiers et de champs : « Eau & milieux marins », « Coordination & animation de projets ».
- Apostrophe typographique (’) et espaces insécables devant : ; ? !
- Aucun emoji. Les flèches ↗ et → servent uniquement d'indicateur de lien.
- Le nom s'écrit CDInnov (C, D et I en capitales). Dans le logo et la signature, il est suivi d'un point en `brand-cyan`.

### Couleur

- Fond de page `paper`, sections secondaires `paper-tint`, champs et cartes `surface`.
- Texte courant et titres en `ink`. Texte secondaire, surtitres et légendes en `muted`.
- `cyan` pour les liens au survol, l'élément de navigation courant, les pictogrammes, l'astérisque des champs obligatoires et l'anneau de focus. Petit texte cyan seulement sur `paper` ou `surface` ; sur `paper-tint` et `highlight`, réservé aux textes de 24px et plus.
- Bouton principal : fond `cyan`, texte `on-cyan`, survol `cyan-hover`. Bouton d'envoi de formulaire : fond `ink`, survol `cyan`.
- Chiffres clés en `blue`, leur suffixe (+) en `cyan`.
- Pied de page de marque sur `navy`, texte blanc, intitulés de colonnes en `muted` du thème sombre (#a2d8ee), liens au survol #92e3f7. Le thème « Bleu nuit » reprend ces valeurs.
- `logo-cyan`, `logo-blue`, `logo-navy`, `logo-grey` et `brand-cyan` sont réservés au logo et au point du nom. Jamais pour du texte.
- Filets de séparation en `line`, 1px.

### Typographie

- Une seule famille, Manrope Variable (graisses 200 à 800), repli Helvetica Neue. Le site utilise des graisses intermédiaires : 450 et 480 pour les titres, 650 pour les libellés et boutons.
- Grands titres très resserrés (interlettrage de -0,045em à -0,065em) et légers : `display`, `chapter`, `statement`, `section`, `row-title`. Un mot clé du titre peut passer en `copper` (« De la complexité à l'*action* »).
- Les tailles des titres sont fluides (clamp) : la valeur du jeton est la taille maximale sur grand écran.
- Texte courant `body` (14px, interligne 1,7), chapeau `lead` (14px, interligne 1,9, en `muted`), descriptions `small`.
- Navigation, filtres et boutons très petits (11px) : `nav`, `button`. Surtitres `micro` en capitales espacées (0,13em).
- Titre d'accueil du site : CDInnov. en Manrope 620, jusqu'à 370px, interligne 0,88, interlettrage -0,082em, point final en `brand-cyan`. À ne reprendre que pour une couverture.

### Mise en page

- Marges latérales fluides : clamp(`gutter-min`, 4,15vw, `gutter-max`). Contenu plafonné à 1800px.
- En-tête fixe de `header-height`, logo couleur à 190px, filet `line` en bas, navigation en `nav` alignée à droite, lien Contact souligné avec ↗.
- Sections séparées par un filet `line` en haut. Les listes (métiers, références, champs d'intervention) sont des lignes séparées par des filets, pas des cartes.
- Surtitre de section : pictogramme `cyan` + `micro` à gauche, numéro ou mention à droite en `muted`.
- Espacements : `stack-sm` dans une colonne, `stack-md` entre éléments d'action, `row-y` pour une ligne de liste, `stack-lg` pour une section.

### États et interactions

- Survol d'un lien ou d'un titre de ligne : passage en `cyan`, la ligne glisse de 5px vers la droite, la flèche ↗ se décale de 3px.
- Bouton principal au survol : `cyan-hover`, élévation de 2px, halo `shadow-glow`.
- Focus clavier : contour plein de 2px en `cyan`, décalé de 6px (3px sur les champs). Contraste ≥ 3:1 sur `paper`, `surface` et `navy`.
- Filtre actif : pastille pleine `cyan`, texte `on-cyan`. Inactif : texte `muted`, bordure `cyan` au survol.
- Animations courtes (0,2 à 0,3s), courbe cubic-bezier(.22,.68,0,1.01). Toutes coupées si l'utilisateur a demandé moins d'animations.

### Iconographie

- Pictogrammes au trait maison, grille de 24px, trait de 1,25px, extrémités arrondies, sans remplissage. Taille 24px (33px en tête de ligne métier, 29px dans les champs d'intervention).
- Toujours en `cyan` sur fond clair. Les fichiers du groupe Icons sont exportés avec un trait #087ca7 ; dans le code, reprendre le tracé en `stroke="currentColor"`.
- Un pictogramme accompagne un texte, il ne le remplace pas (aria-hidden).
- Le drapeau européen apparaît en bandeau avec la mention des programmes (Interreg, Horizon Europe, LEADER, FEAMPA).

### Logo

- `cdinnov-logo.svg` : version couleur, sur `paper`, `paper-tint` ou `surface`. Largeur minimale 130px.
- `cdinnov-logo-monochrome.svg` : version une couleur (#2e2e2e). Sur `navy` ou sur photo, l'afficher en blanc avec le filtre CSS `brightness(0) invert()`, comme le site.
- Ne jamais redessiner, recolorer, déformer ni poser le logo couleur sur un fond foncé.

### Images

- Portraits de l'équipe en cercle (`radius-round`) avec `shadow-portrait`.
- Logos de partenaires et de projets sur fond `surface`, coins `radius-logo`.
- Visuels d'actualité en pleine largeur de colonne, sans cadre.

## Jetons

### Couleurs

| Jeton | Clair | Bleu nuit | Usage |
|---|---|---|---|
| `--paper` | `#f8fbff` | `#113660` | Fond de page. Sombre : fond du pied de page du site. |
| `--paper-tint` | `#eef6fd` | `#143e6d` | Fond de section secondaire (pied de page éditorial, bandeaux). Texte : ink ou muted. |
| `--surface` | `#ffffff` | `#143e6d` | Champs de formulaire, cartes de référence, fonds de logos partenaires. |
| `--highlight` | `#dfedf8` | `{paper-tint}` | Fond des étiquettes de chapitre et messages préparés, toujours avec un filet gauche cyan de 3px. Texte : ink. |
| `--ink` | `#183f77` | `#ffffff` | Texte principal, titres, bouton d'envoi. Sur paper, paper-tint, surface, highlight (10:1 en clair, 12:1 en sombre). |
| `--muted` | `#4e6c8e` | `#a2d8ee` | Texte secondaire, surtitres, légendes, filtres inactifs. Sur paper et surface (5,2:1), paper-tint (5:1). Sombre : intitulés de colonnes du pied de page (7,9:1). |
| `--muted-alt` | `#466d87` | `#a2d8ee` | Métadonnées de projet et organisations des témoignages (petites capitales 10 à 12px). Sur paper (5,3:1). |
| `--cyan` | `#087ca7` | `#79d6f0` | Accent unique : survol des liens, élément actif, pictogrammes, surtitres de section, astérisque obligatoire, anneau de focus. Texte sur paper et surface (4,6:1). Sur paper-tint et highlight : 4,3:1 et 4:1, réservé aux textes de 24px et plus. Sombre : 7,4:1 sur paper. |
| `--copper` | `{cyan}` | `= clair` | Alias historique du site (--copper), même valeur que cyan : lien de navigation courant, mots mis en valeur dans les grands titres. |
| `--cyan-hover` | `#1662a9` | `#92e3f7` | Survol du bouton principal cyan. Sombre : survol des liens du pied de page. |
| `--on-cyan` | `#ffffff` | `#113660` | Texte sur un fond cyan ou cyan-hover (4,7:1 et 6,3:1 en clair ; 7,4:1 en sombre). |
| `--blue` | `#2453a1` | `{cyan}` | Grands chiffres clés (600+ projets, 1 200 collaborations). Sur paper (7,2:1). |
| `--indigo` | `#2c4488` | `= clair` | Déclaré par le site, usage marginal. Clair uniquement : ne pas employer sur fond sombre. |
| `--line` | `#c9dcea` | `#ffffff30` | Filets de séparation (en-tête, lignes de liste, bandes de filtres). Décoratif : ne porte jamais seul une information. |
| `--field-border` | `#6c89a3` | `#aac3d7` | Bordure des champs de formulaire (3,7:1 sur surface). |
| `--switch-off` | `#dbe6ee` | `#143e6d` | Piste d'un interrupteur désactivé, avec bordure field-border. |
| `--navy` | `#113660` | `= clair` | Fond du pied de page de marque dans les deux thèmes. Texte : blanc, liens au survol #92e3f7. |
| `--brand-cyan` | `#00aae3` | `= clair` | Point final du nom CDInnov. et lettres lumineuses du titre d'accueil. Décoratif uniquement (2,6:1 sur paper) : jamais pour du texte courant. |
| `--logo-cyan` | `#00aeef` | `= clair` | Couleur du logo (dégradé du symbole et des lettres CD). Réservé au logo. |
| `--logo-blue` | `#0067c8` | `= clair` | Fin du dégradé du symbole du logo. Réservé au logo. |
| `--logo-navy` | `#0b335f` | `= clair` | Lettres INNOV du logo. Réservé au logo. |
| `--logo-grey` | `#b6b8ba` | `= clair` | Facette grise du symbole du logo. Réservé au logo. |

### Typographie

Famille : `--font-sans` = Manrope Variable, Helvetica Neue, sans-serif. Tailles des titres fluides sur le site (clamp) : la valeur indiquée est le maximum grand écran.

| Classe | Taille | Interligne | Graisse | Interlettrage | Usage |
|---|---|---|---|---|---|
| `.display` | 128px | 1.06 | 480 | -0.065em | Grand titre d'ouverture de page (h1 éditorial, invitation contact). Taille fluide de 50 à 128px. |
| `.chapter` | 110px | 1.03 | 500 | -0.06em | Titre de chapitre de la page d'accueil. Fluide de 45 à 110px. |
| `.evidence` | 120px | 1 | 530 | -0.065em | Chiffres clés, couleur blue, suffixe en cyan à 0,58em. |
| `.statement` | 88px | 1.15 | 480 | -0.052em | Phrase manifeste (section Notre regard). Fluide de 38 à 88px. |
| `.section` | 55px | 1.15 | 480 | -0.055em | Titre h2 de section ou d'article. Fluide de 30 à 55px. |
| `.row-title` | 39px | 1.2 | 450 | -0.045em | Titre h3 des lignes dépliables (métiers, actualités). Passe en cyan au survol et à l'ouverture. |
| `.title-sm` | 24px | 1.25 | 500 | -0.035em | Nom de client ou de référence dans une liste. |
| `.item-title` | 16px | 1.45 | 650 | 0 | Intitulé h4 d'un champ d'intervention ou d'un élément de liste. |
| `.lead` | 14px | 1.9 | 400 | 0 | Chapeau sous un titre, couleur muted. |
| `.body` | 14px | 1.7 | 400 | 0 | Texte courant, couleur ink. |
| `.small` | 12px | 1.8 | 400 | 0 | Description courte sous un intitulé, couleur muted. |
| `.label` | 12px | 1.5 | 650 | 0 | Libellé de champ de formulaire. |
| `.button` | 11px | 1.4 | 650 | 0 | Texte des boutons et liens d'action. |
| `.nav` | 11px | 1.4 | 500 | 0 | Navigation principale et filtres. |
| `.micro` | 11px | 1.6 | 550 | 0.13em | Surtitre en capitales (text-transform: uppercase), couleur muted ou cyan. |

### Espacements

| Jeton | Valeur | Usage |
|---|---|---|
| `--gutter-min` | `24px` | Marge latérale minimale (mobile). La marge réelle est clamp(24px, 4.15vw, 80px). |
| `--gutter-max` | `80px` | Marge latérale maximale (grands écrans). |
| `--header-height` | `88px` | Hauteur de l'en-tête fixe, logo à 190px de large. |
| `--field-y` | `13px` | Marge intérieure verticale des champs. |
| `--field-x` | `14px` | Marge intérieure horizontale des champs. |
| `--button-y` | `17px` | Marge intérieure verticale des boutons. |
| `--button-x` | `24px` | Marge intérieure horizontale des boutons. |
| `--stack-sm` | `18px` | Écart entre éléments d'une même colonne (liens de pied de page, pictogramme et texte). |
| `--stack-md` | `30px` | Écart entre texte et flèche dans un lien, entre filtres. |
| `--row-y` | `33px` | Marge verticale d'une ligne dépliable. |
| `--stack-lg` | `60px` | Marge intérieure verticale des sections et du pied de page. |

### Arrondis

| Jeton | Valeur | Usage |
|---|---|---|
| `--radius-button` | `2px` | Boutons et actions. L'identité est quasi angulaire. |
| `--radius-field` | `3px` | Champs de formulaire, boutons secondaires. |
| `--radius-label` | `4px` | Coin droit des étiquettes de chapitre (0 4px 4px 0). |
| `--radius-logo` | `5px` | Vignettes de logos partenaires. |
| `--radius-bubble` | `18px` | Bulles de témoignage (18px 18px 18px 5px). |
| `--radius-pill` | `30px` | Filtres de références en pastille, interrupteurs. |
| `--radius-round` | `50%` | Portraits, monogrammes, points. |

### Ombres

| Jeton | Valeur | Usage |
|---|---|---|
| `--shadow-menu` | `0 25px 50px #08121a1f` | Menu mobile déplié. Seule ombre portée structurelle. |
| `--shadow-portrait` | `0 12px 35px #2b6c9917` | Portraits de l'équipe. |
| `--shadow-glow` | `0 0 35px #26c2e33a` | Halo cyan au survol du bouton principal. |

### Points de rupture

| Jeton | Valeur | Usage |
|---|---|---|
| `--bp-wide` | `1700px` | Au-delà : contenu plafonné à 1800px. |
| `--bp-desktop` | `1100px` | En dessous : navigation et grilles resserrées. |
| `--bp-tablet` | `900px` | En dessous : menu mobile. |
| `--bp-mobile` | `700px` | En dessous : une colonne, logo à 145px. |
| `--bp-small` | `360px` | Petits téléphones, logo à 130px. |

## Composants

Chaque composant suppose `tokens.css` et `components.css` chargés et un ancêtre `.cdi-root`.

### Button

Bouton d'action rectangulaire, coins de 2px, texte court en `button` (11px, 650) suivi d'une flèche.

- Classe `cdi-button` : fond `cyan`, texte `on-cyan`. Au survol `cyan-hover`, élévation de 2px et halo `shadow-glow`.
- Variante `cdi-button--ink` pour l'envoi d'un formulaire : fond `ink`, survol `cyan`.
- Le consommateur fournit un libellé à l'infinitif ou à l'impératif adressé (« Parlons de votre projet », « Explorer nos métiers », « Envoyer le message ») et la flèche SVG de 15px (`stroke: currentColor`).
- Un seul bouton principal par écran. Pour une action secondaire, utiliser TextLink.
- Ne pas arrondir davantage, ne pas mettre d'icône à gauche, ne pas passer le texte en capitales.

Exemple (`components/examples/Button.html`) :

```html
<div class="cdi-root" style="display:flex;flex-wrap:wrap;gap:24px;align-items:center;padding:28px">
  <a class="cdi-button" href="#">Parlons de votre projet <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M5 4h7v7"/></svg></a>
  <a class="cdi-button is-hover" href="#">Survol <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M5 4h7v7"/></svg></a>
  <button class="cdi-button cdi-button--ink" type="button">Envoyer le message <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M5 4h7v7"/></svg></button>
</div>
```

### TextLink

Lien secondaire souligné d'un filet de 1px, texte 12px et flèche ↗ à droite.

- Classe `cdi-text-link` sur un `<a>`. Au survol, texte en `cyan` et flèche décalée de 3px vers le haut à droite.
- Le consommateur fournit le libellé et la flèche SVG de 15px.
- Pour « Notre accompagnement en détail », « Découvrir l'accompagnement », lien Contact de l'en-tête.
- Ne pas l'utiliser pour l'action principale d'une page (voir Button).

Exemple (`components/examples/TextLink.html`) :

```html
<div class="cdi-root" style="display:flex;flex-wrap:wrap;gap:40px;align-items:center;padding:28px">
  <a class="cdi-text-link" href="#">Notre accompagnement en détail <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M5 4h7v7"/></svg></a>
  <a class="cdi-text-link is-hover" href="#">Découvrir l’accompagnement <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M5 4h7v7"/></svg></a>
</div>
```

### FilterChip

Pastille de filtre exclusive, utilisée pour trier la liste des références.

- Conteneur `cdi-filters` (filets `line` en haut et en bas), boutons `cdi-filter` avec `aria-pressed`.
- Actif : fond `cyan`, texte `on-cyan`. Inactif : texte `muted`, bordure `cyan` au survol.
- Le consommateur fournit les catégories (libellés courts, majuscule initiale) et gère l'état sélectionné.
- Une seule pastille active à la fois. Pas d'icône, pas de compteur.

Exemple (`components/examples/FilterChip.html`) :

```html
<div class="cdi-root" style="padding:20px 28px">
  <div class="cdi-filters" role="group" aria-label="Filtrer les références">
    <button class="cdi-filter" aria-pressed="true">Toutes</button>
    <button class="cdi-filter" aria-pressed="false">Collectivités</button>
    <button class="cdi-filter" aria-pressed="false">Établissements publics</button>
    <button class="cdi-filter" aria-pressed="false">Associations</button>
    <button class="cdi-filter" aria-pressed="false">Entreprises</button>
  </div>
</div>
<script>document.querySelectorAll('.cdi-filter').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.cdi-filter').forEach(function(x){x.setAttribute('aria-pressed','false')});b.setAttribute('aria-pressed','true')})})</script>
```

### FormField

Champ de formulaire avec libellé au-dessus, utilisé dans le formulaire de contact.

- `<label class="cdi-field">` contient le libellé (`label`, 12px 650) puis le contrôle (`input`, `select` ou `textarea`).
- Champ obligatoire : astérisque dans un `<span>` en `cyan` après le libellé.
- Contrôle : fond `surface`, bordure `field-border`, coins `radius-field`, hauteur minimale 47px, texte 16px.
- Focus : bordure et contour de 2px en `cyan`, décalé de 3px.
- Aide ou mention : un `<small>` dans le label, en `muted`, 11px.
- Le consommateur fournit libellé, placeholder concret (« Programme visé, calendrier, partenaires envisagés ») et validation.

Exemple (`components/examples/FormField.html`) :

```html
<form class="cdi-root" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:28px" onsubmit="return false">
  <label class="cdi-field">Nom <span>*</span><input type="text" placeholder="Votre nom" required></label>
  <label class="cdi-field">Organisation<input type="text" placeholder="Collectivité, entreprise, association"></label>
  <label class="cdi-field">Votre besoin <span>*</span><select><option>Montage d’une candidature</option><option>Suivi administratif et financier</option><option>Stratégie territoriale</option></select></label>
  <label class="cdi-field">Courriel <span>*</span><input type="email" placeholder="nom@organisation.fr"></label>
  <label class="cdi-field" style="grid-column:1/-1">Message<textarea rows="3" placeholder="Programme visé, calendrier, partenaires envisagés"></textarea><small>Les champs marqués d’un astérisque sont obligatoires.</small></label>
</form>
```

### Switch

Interrupteur marche / arrêt, repris du panneau des préférences de confidentialité.

- `<label class="cdi-switch">` avec le libellé puis `<input type="checkbox" role="switch">`.
- Désactivé : piste `switch-off`, bordure `field-border`. Activé : piste et bordure `cyan`.
- Le consommateur fournit le libellé et l'état. Ajouter sous le libellé une phrase d'explication en `muted` si l'effet n'est pas évident.

Exemple (`components/examples/Switch.html`) :

```html
<div class="cdi-root" style="display:grid;gap:20px;max-width:420px;padding:28px">
  <label class="cdi-switch">Mesure d’audience<input type="checkbox" role="switch" checked></label>
  <label class="cdi-switch">Contenus vidéo intégrés<input type="checkbox" role="switch"></label>
</div>
```

### SectionKicker

Surtitre placé au-dessus d'un titre de section, en petites capitales espacées.

- `cdi-kicker` : à gauche, pictogramme 24px et intitulé en `cyan` ; à droite, mention en `muted`. Style `micro` (11px, 550, 0,13em, capitales).
- `cdi-label` : étiquette de chapitre sur fond `highlight`, filet gauche cyan de 3px, coin droit `radius-label`. Texte en `ink`.
- Le consommateur fournit l'intitulé (2 à 4 mots), la mention de droite et le tracé du pictogramme (groupe Icons).
- Un surtitre par section, jamais deux à la suite.

Exemple (`components/examples/SectionKicker.html`) :

```html
<div class="cdi-root" style="display:grid;gap:28px;padding:28px">
  <div class="cdi-kicker"><span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></svg>Nos métiers</span><span>De l’ambition à la réalisation</span></div>
  <div><span class="cdi-label">Depuis 1981</span></div>
</div>
```

### ExpertiseRow

Ligne dépliable d'une liste de métiers ou d'actualités, séparée par des filets plutôt que présentée en carte.

- `<details class="cdi-row">` : un `summary` (pictogramme 33px en `cyan`, titre h3 en `row-title`, signe plus), puis `cdi-row-body`.
- Corps : dans `cdi-row-copy`, verbe à l'infinitif en `item-title` (« Sécuriser. »), une phrase en `muted`, liste de 3 à 5 prestations séparées par des filets `line`.
- Au survol et à l'ouverture, le titre passe en `cyan` et glisse de 5px.
- Le consommateur fournit le pictogramme (groupe Icons), le titre, le verbe, la phrase et la liste.
- Empiler les lignes sans marge entre elles : les filets suffisent.

Exemple (`components/examples/ExpertiseRow.html`) :

```html
<div class="cdi-root" style="padding:8px 28px 28px">
  <details class="cdi-row" open>
    <summary><svg class="cdi-row-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z"/><path d="m8 12 3 3 5-6"/></svg><h3>Gestion financière &amp; appui aux contrôles</h3><span class="cdi-row-toggle" aria-hidden="true"></span></summary>
    <div class="cdi-row-body">
      <div class="cdi-row-copy"><p class="cdi-verb">Sécuriser.</p><p>Relier l’avancement des activités à celui des budgets, fiabiliser les dossiers et anticiper les échéances.</p></div>
      <ul><li>Suivi budgétaire et préparation des révisions</li><li>Organisation des justificatifs et des dossiers permanents</li><li>Rapports techniques et financiers, saisie sur JEMS</li><li>Préparation et assistance aux contrôles des programmes</li></ul>
    </div>
  </details>
  <details class="cdi-row">
    <summary><svg class="cdi-row-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M7 16v-4m5 4V9m5 7V5M6 7l5-3 4 1 6-3"/></svg><h3>Données, évaluation &amp; outils de pilotage</h3><span class="cdi-row-toggle" aria-hidden="true"></span></summary>
    <div class="cdi-row-body"><div class="cdi-row-copy"><p class="cdi-verb">Éclairer l’action.</p><p>Rendre l’information utile à la décision.</p></div><ul><li>Tableaux de bord budgétaires et opérationnels</li></ul></div>
  </details>
</div>
```

### BrandFooter

Pied de page de marque, seul grand aplat foncé du site.

- `<footer class="cdi-footer">` sur `navy`, texte blanc, trois colonnes (présentation, plan du site, bureaux), ligne de bas de page séparée par un filet blanc à 19 % d'opacité.
- Logo monochrome affiché en blanc par le filtre `brightness(0) invert()`, 190px de large.
- Intitulés de colonnes en capitales 11px, couleur #a2d8ee ; liens 13px, survol #92e3f7.
- Le consommateur fournit le texte de présentation, les liens et les coordonnées des bureaux (Bastia, Marseille).
- Ne jamais poser le logo couleur sur ce fond.

Exemple (`components/examples/BrandFooter.html`) :

```html
<footer class="cdi-root cdi-footer">
  <div class="cdi-footer-columns">
    <div><img class="cdi-footer-logo" src="../../assets/logos/cdinnov-logo-monochrome.svg" alt="CDInnov"><p>Cabinet de conseil indépendant, CDInnov accompagne depuis 1981 le montage, le management et le suivi de projets européens, ainsi que le développement des territoires.</p></div>
    <div><h2>Plan du site</h2><nav><a href="#">Nos métiers</a><a href="#">Notre équipe</a><a href="#">Nos références</a><a href="#">Actualités</a><a href="#">Contact</a></nav></div>
    <div><h2>Nos bureaux</h2><address><h3>Bastia</h3><a href="#">Écrire au bureau de Bastia</a></address><address><h3>Marseille</h3><a href="#">Écrire au bureau de Marseille</a></address></div>
  </div>
  <div class="cdi-footer-bottom"><span>© CDInnov</span><span>Mentions légales · Confidentialité</span></div>
</footer>
```

## Fichiers

Logos officiels de CDInnov, copiés du site www.cdinnov.eu.

- `cdinnov-logo.svg` : version couleur (dégradés `logo-cyan` vers `logo-blue`, lettres INNOV en `logo-navy`, facette `logo-grey`), avec la signature « Conseil • Développement • Innovation ». Sur fond clair uniquement. Largeur minimale 130px, 190px dans l'en-tête.
- `cdinnov-logo-monochrome.svg` : une seule encre #2e2e2e. Sur fond foncé (`navy`), l'afficher en blanc avec le filtre CSS `brightness(0) invert()`.
- Proportions 3532 × 696. Ne pas recolorer, recadrer, déformer ni séparer le symbole du nom.

Pictogrammes au trait du site www.cdinnov.eu : grille 24 × 24, trait 1,25px, extrémités et angles arrondis, sans remplissage.

- Exportés avec un trait #087ca7 (`cyan` du thème clair). Dans une page, recopier le tracé dans un `<svg>` en ligne avec `stroke="currentColor"` pour hériter de la couleur.
- Navigation : accueil, metiers, equipe, references, actualites, contact.
- Métiers : securiser (gestion financière), territoire (stratégies territoriales), donnees (données et pilotage).
- Champs d'intervention : ecosystemes, eau, energie, recherche, patrimoines, economie-circulaire, emploi.
- Toujours accompagnés d'un texte ; taille 24px, 29px ou 33px selon le contexte.

Image de partage sur les réseaux sociaux (1200 × 630) utilisée par le site : logo couleur, « Projets européens & développement territorial », « Bastia · Marseille », bandeau cyan en pied. À réutiliser telle quelle pour les aperçus de liens.

## À ne pas faire

- Dégradés, encadrés ou cartes colorés, ombres décoratives, emoji.
- Couleur d'accent autre que `--cyan`.
- Arrondis supérieurs à `--radius-field` hors filtres, interrupteurs et portraits.
- Logo couleur sur fond foncé, logo recoloré ou redessiné.
- Polices autres que Manrope.
