# Embedded PDF font

`DejaVuSans.ttf` is the unmodified DejaVu Sans 2.37 font distributed with the
Codex Poppler runtime. The upstream font project is
https://dejavu-fonts.github.io/ and its release is
https://github.com/dejavu-fonts/dejavu-fonts/releases/tag/version_2_37.

`LICENSE-DejaVu.txt` is the unmodified license from the upstream `version_2_37`
tag: https://github.com/dejavu-fonts/dejavu-fonts/blob/version_2_37/LICENSE.

The renderer always embeds this exact file; it never selects a system font.
Characters absent from the font and scripts requiring unsupported shaping are
rejected with a visible error before generation rather than substituted.
