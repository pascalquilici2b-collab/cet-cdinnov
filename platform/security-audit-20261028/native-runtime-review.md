# Revue défensive des dépendances natives — 28 octobre 2026

Périmètre : Tesseract et OpenJDK utilisés par le service documentaire, avec qualification de deux avis Ghostscript restants en coordination avec la revue documentaire. Analyse des sources locales et des avis officiels ; aucun document d'exploitation, modèle OCR hostile, test réseau offensif, build ou déploiement réalisé dans cette tâche.

**Décision et résultat.** La migration vers Debian 13/trixie et `openjdk-21-jre-headless >= 21.0.13+9-1~deb13u2` corrige les deux avis Java confirmés dans l'inventaire de départ. L'audit principal a confirmé sa mise en production sur le build Render `10718c1`. Les dix avis Tesseract restent ouverts pour la source du paquet trixie `5.5.0-1`, mais tous exigent le chargement d'un modèle OCR malveillant. Ce prérequis n'est pas accessible depuis les entrées documentaires du code examiné. Il faut conserver cette qualification conditionnelle et les protections sur les modèles ; elle ne signifie pas que le paquet est corrigé.

**Inventaire et niveau de preuve.** L'image Render initiale a été signalée avec Tesseract `5.3.0-2` et OpenJDK `17.0.21+9-1~deb12u1`. Le [Dockerfile local](C:/Users/quili/AppData/Local/CDInnov/billing-refonte-20261019/facturx-service/Dockerfile) utilise maintenant `python:3.12-slim-trixie` et Java 21, à la suite des changements de l'agent documentaire. Le [contrôle des versions Debian](C:/Users/quili/AppData/Local/CDInnov/billing-refonte-20261019/facturx-service/deployment/verify_native_packages.py) impose les révisions minimales Java et Ghostscript. L'audit principal a ensuite confirmé le build Render `10718c1` LIVE avec Ghostscript `10.05.1~dfsg-1+deb13u3`, Java 21 `21.0.13+9-1~deb13u2` et Tesseract `5.5.0-1+b1`, ainsi que la réussite des tests Linux, PDF/A et OCR. Ces résultats de livraison ont été transmis par le responsable de l'audit ; cette sous-tâche n'a pas réinterrogé Render. Le suffixe binaire Tesseract `+b1` ne constitue pas un correctif des avis restant ouverts sur sa source `5.5.0-1`.

## Tesseract : modèles fixes et avis toujours ouverts

Les appels examinés sont entièrement construits par le serveur :

- [stamping_pdf.py:112](C:/Users/quili/AppData/Local/CDInnov/billing-refonte-20261019/facturx-service/cdi_facturx/stamping_pdf.py:112) écrit une image préparée sous le nom local fixe `page.png`, puis lance Tesseract avec les langues `fra+eng+ita`, `--psm 3` et une durée maximale de 25 secondes.
- [stamping_tables.py:45](C:/Users/quili/AppData/Local/CDInnov/billing-refonte-20261019/facturx-service/cdi_facturx/stamping_tables.py:45) produit une planche d'images `cells.png`, puis utilise `fra+eng`, `--psm 11` et le format TSV. Les planches sont bornées et chaque appel expire après 25 secondes.
- Les deux appels utilisent un tableau d'arguments `subprocess.run`, sans shell. Aucune langue, option, chemin de modèle, configuration Tesseract ou donnée `.traineddata` ne provient d'une requête. La recherche dans `cdi_facturx` et `deployment` n'a trouvé aucun autre chargeur de modèles.
- Le Dockerfile installe les modèles français, anglais et italien par APT, puis exécute le service comme UID/GID 10001. Il ne prévoit aucun téléchargement de modèle pendant une requête.

Le [tracker officiel Debian Tesseract](https://security-tracker.debian.org/tracker/source-package/tesseract) maintient les dix avis suivants ouverts pour bookworm `5.3.0-2` et trixie `5.5.0-1`. Les fiches décrivent des structures de modèle à contrôler, même lorsque la corruption ne se manifeste qu'au moment de reconnaître une image.

| Avis officiel | Entrée nécessaire et effet annoncé | État du correctif |
| --- | --- | --- |
| [CVE-2026-73066](https://security-tracker.debian.org/tracker/CVE-2026-73066) | Modèle `.traineddata` LSTM spécialement construit ; corruption mémoire pendant l'OCR. | Corrigé en amont dans 5.5.3 ; paquet trixie encore affecté. |
| [CVE-2026-73067](https://security-tracker.debian.org/tracker/CVE-2026-73067) | Dictionnaire inclus dans un modèle hostile ; lecture hors limites et arrêt à l'initialisation. | Corrigé en amont dans 5.5.3 ; paquet trixie encore affecté. |
| [CVE-2026-88047](https://security-tracker.debian.org/tracker/CVE-2026-88047) | Composant NORMPROTO d'un modèle hostile, moteur historique ; corruption de pile. | Commit correctif référencé ; aucune version publiée corrigée annoncée dans la fiche. |
| [CVE-2026-88048](https://security-tracker.debian.org/tracker/CVE-2026-88048) | Dimensions incohérentes d'un modèle LSTM hostile ; lectures/écritures hors limites. | Même état, versions jusqu'à 5.5.3 incluses affectées. |
| [CVE-2026-88049](https://security-tracker.debian.org/tracker/CVE-2026-88049) | Dimensions incohérentes d'un modèle LSTM hostile ; corruption mémoire. | Même état. |
| [CVE-2026-88050](https://security-tracker.debian.org/tracker/CVE-2026-88050) | Composant recoder d'un modèle hostile ; arrêt du moteur. | Même état. |
| [CVE-2026-88051](https://security-tracker.debian.org/tracker/CVE-2026-88051) | Composant INTTEMP d'un modèle hostile ; corruption mémoire. | Même état. |
| [CVE-2026-88052](https://security-tracker.debian.org/tracker/CVE-2026-88052) | UNICHARSET hostile ; corruption mémoire à l'initialisation, moteurs LSTM et historique. | Même état. |
| [CVE-2026-88053](https://security-tracker.debian.org/tracker/CVE-2026-88053) | Composant INTTEMP hostile ; corruption mémoire du moteur historique. | Même état. |
| [CVE-2026-88054](https://security-tracker.debian.org/tracker/CVE-2026-88054) | Réseau vide dans un modèle hostile ; arrêt au chargement. | Même état. |

**Qualification pour ce service : prérequis d'exploitation non exposé par les routes examinées.** Les images envoyées ne deviennent pas des modèles. Les modèles et exécutables fournis par l'image doivent toutefois rester de confiance et non modifiables par le compte du service. Cette conclusion suppose aussi l'absence de surcharge non maîtrisée de `PATH`, `TESSDATA_PREFIX` ou de montage sur les répertoires de modèles. Ces invariants de l'environnement Render effectif n'ont pas été mesurés dans cette tâche.

Les limites de temps, la taille des images et l'utilisateur non privilégié réduisent certains effets ; ils ne corrigent pas une corruption mémoire native. La migration vers Tesseract 5.5.0 ne doit donc pas être annoncée comme la fermeture de ces avis. Passer uniquement à 5.5.3 en compilation privée fermerait les deux premiers, sans fermer les huit autres. Conserver les paquets Debian et suivre leur correctif complet est justifié pour le chemin actuel à modèles fixes. Toute future fonction d'import de modèles, de choix libre de langue ou de configuration doit faire réexaminer cette décision avant activation.

## Java : mise à jour recommandée et portée réelle

À l'exécution du service, Java sert à lancer le JAR local veraPDF 1.30.2. [service.py:92](C:/Users/quili/AppData/Local/CDInnov/billing-refonte-20261019/facturx-service/cdi_facturx/service.py:92) transmet uniquement `-jar`, le JAR configuré, `--format xml`, `--flavour 3b` et le chemin local du PDF final. Le lanceur [service.py:46](C:/Users/quili/AppData/Local/CDInnov/billing-refonte-20261019/facturx-service/cdi_facturx/service.py:46) utilise une liste d'arguments sans shell et une expiration de 120 secondes. Les options ne sont pas fournies par l'utilisateur. Le profil 3b est un profil intégré de conformité PDF/A ; l'application ne fournit ni profil ni configuration Java téléchargés. Voir la [documentation officielle veraPDF](https://docs.verapdf.org/cli/validation/).

L'installation du JAR est distincte : [install_verapdf.py](C:/Users/quili/AppData/Local/CDInnov/billing-refonte-20261019/facturx-service/deployment/install_verapdf.py) télécharge l'archive avec Python, vérifie son empreinte attendue, puis exécute l'installateur Java local pendant le build. Aucun programme Java utilisateur, applet ou Java Web Start n'est lancé. Les chemins du JAR et de Java restent néanmoins des paramètres de déploiement de confiance.

| Avis | Condition pertinente pour le service | Conclusion et action |
| --- | --- | --- |
| [CVE-2026-91403, Debian](https://security-tracker.debian.org/tracker/CVE-2026-91403) | Validation TLS/JSSE reposant sur des certificats intermédiaires eMudhra concernés. L'[avis Oracle](https://www.oracle.com/security-alerts/alert-cve-2026-91403.html) explique le retrait de leur confiance. Aucun usage TLS Java n'a été identifié dans notre lanceur veraPDF local. | Le paquet initial `17.0.21+9-1~deb12u1` est classé affecté. Le paquet trixie Java 21 `21.0.13+9-1~deb13u2` confirmé dans le nouveau build est corrigé. |
| [CVE-2026-101516, Debian](https://security-tracker.debian.org/tracker/CVE-2026-101516) | [Red Hat](https://access.redhat.com/security/cve/cve-2026-101516) identifie le contrôle des contraintes de certificats, CWE-295. Le simple fait de parser un PDF ne démontre pas l'appel de cette fonction. Aucun chemin correspondant n'a été identifié dans notre code d'intégration. | Le paquet initial bookworm est classé affecté. La fiche Debian consultée en dernier marque aussi `21.0.13+9-1~deb13u2` corrigé. La même migration ferme cet avis au niveau du paquet. |
| [CVE-2026-91395](https://security-tracker.debian.org/tracker/CVE-2026-91395) et [CVE-2026-91396](https://security-tracker.debian.org/tracker/CVE-2026-91396) | La description officielle distingue Java SE 8/11 de GraalVM 17/21. Les tables Debian recensent `openjdk-8` et `openjdk-11`, pas `openjdk-17` ni `openjdk-21`. Notre Dockerfile installe OpenJDK Debian, pas GraalVM. | L'attribution OSV signalée à OpenJDK 17 n'est pas confirmée par ces données officielles. Réconcilier le nom exact et l'écosystème du paquet du scanner ; ne pas assimiler les numéros de GraalVM aux paquets Debian. Ne pas étiqueter arbitrairement tout Java 17 comme affecté ou corrigé. |

La [DSA-6588-1](https://security-tracker.debian.org/tracker/DSA-6588-1) confirme le seuil Java 21 et couvre explicitement 101516 et 91403. Cette constatation remplace la note intermédiaire indiquant que 101516 resterait ouvert sur Java 21. Une version amont affichée par `java -version` ne suffit pas à comparer des corrections Debian : conserver la révision complète issue de `dpkg-query`.

**Compatibilité.** La [matrice officielle veraPDF au tag 1.30.2](https://raw.githubusercontent.com/veraPDF/veraPDF-apps/v1.30.2/.github/workflows/test-pr.yml) contient Java 11, 17, 21 et 25. Elle étaye le passage à Java 21 ; l'audit principal a ensuite confirmé la réussite des vérifications applicatives Linux, PDF/A et OCR du nouveau build.

Le verdict de portée Java reste une analyse statique de l'intégration. Aucun graphe complet des appels du JAR ni trace de réseau de veraPDF n'a été produit. L'absence d'appel TLS explicite dans Python ne garantit pas l'absence de tout appel de validation de certificat dans une dépendance Java. De même, `no_network=True` lors de la lecture Python du rapport XML ne restreint pas le processus Java. La disponibilité d'un paquet corrigé rend préférable sa mise à jour à une exemption Java fondée seulement sur cette analyse de portée.

## Deux avis Ghostscript résiduels

La revue documentaire traite les autres correctifs Ghostscript et le seuil `10.05.1~dfsg-1+deb13u3`. Les deux fiches suivantes restent indiquées affectées dans leur tableau de versions, avec des notes de construction Debian qui expliquent leur qualification :

- [CVE-2025-59800](https://security-tracker.debian.org/tracker/CVE-2025-59800) : le composant OCR Ghostscript concerné n'est pas compilé avec le support Tesseract dans Debian. Notre OCR appelle séparément le programme Tesseract et le chemin Ghostscript utilise `pdfwrite`.
- [CVE-2025-59801](https://security-tracker.debian.org/tracker/CVE-2025-59801) : le code GhostXPS concerné n'est pas compilé dans le paquet Debian. Le service ne demande pas de traitement XPS.

Pour ces deux avis, l'absence du composant dans la construction Debian est le fondement principal de la non-exposition, plus solide que le seul choix d'options du service. Il faut conserver le paquet officiel correspondant ; une compilation privée de Ghostscript réactiverait potentiellement ces composants et invaliderait cette qualification.

## Vérifications et limites de cette tâche

Relecture ciblée des appels natifs, de l'installation veraPDF, du Dockerfile et de la barrière de versions, avec recherche des autres usages Tesseract/Java ; consultation des avis Debian, Oracle, Red Hat et de la documentation/matrice veraPDF. Aucun test d'exploitation n'a été réalisé. Le seul fichier modifié par cette tâche est ce rapport.

La validation de livraison conserve les étapes prévues dans l'image : `deployment.verify_native_packages`, `deployment.verify_document_security`, `deployment.verify_runtime` et `deployment.verify_stamping`. Leur réussite dans le nouveau build Linux a été confirmée par l'audit principal, avec les versions indiquées dans l'inventaire ci-dessus. Cette tâche n'a pas elle-même exécuté ces tests. Elle ne prétend pas que tous les paquets transitifs ont été audités ni que le service est exempt de vulnérabilités natives.
