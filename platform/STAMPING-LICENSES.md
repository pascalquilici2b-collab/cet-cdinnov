# Bibliothèques utilisées par le tamponnage

| Bibliothèque | Version ciblée | Usage | Licence déclarée |
|---|---|---|---|
| pypdf | 6.19.0, déjà présente | Lecture et ajout non destructif | BSD-3-Clause |
| ReportLab | 4.4.9, déjà présente | Dessin vectoriel du tampon | BSD |
| Pillow | 12.3.0, déjà présente | Comparaison et masques visuels | MIT-CMU |
| openpyxl | 3.1.5, ajoutée | XLSX et provenance | MIT |
| et_xmlfile | 2.0.0, ajoutée | Dépendance openpyxl | MIT |
| pypdfium2 | 5.14.0, ajoutée | Rendu et inspection des objets | Apache-2.0 ou BSD-3-Clause |
| PDFium, distribué avec le wheel pypdfium2 | version du wheel verrouillé | Moteur de rendu natif | BSD et notices de dépendances incluses dans le wheel |
| Tesseract et données fra/eng/ita | paquets Debian Bookworm | OCR dans le service | Apache-2.0 |
| DejaVu Sans | fichier déjà distribué dans le service | Police incorporée | Licence DejaVu / Bitstream Vera, voir `assets/fonts/LICENSE-DejaVu.txt` |
| fflate | 0.8.3, déjà présente | ZIP de sortie | MIT |

Le moteur de tamponnage n'importe pas PyMuPDF. Cette dépendance préexistante et les autres composants du service Factur-X conservent leurs obligations propres ; cette livraison ne change pas leur régime de licence.

Les wheels installés conservent leurs fichiers de licence et les notices PDFium. Ils doivent rester présents dans l'image distribuée. La documentation de pypdfium2 précise les licences du binding et l'obligation de distribuer les notices de PDFium et de ses dépendances : [licences officielles](https://pypdfium2.readthedocs.io/en/stable/readme.html#licensing). Les métadonnées de licence des distributions installées et la licence de police du dépôt ont été consultés pour cet inventaire. Le choix des nouvelles bibliothèques n'ajoute pas de moteur PDF sous AGPL.
