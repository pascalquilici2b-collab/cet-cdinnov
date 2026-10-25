# Payment document imports and eligible service amounts

Upload cards adapt the icon fan and nested drag-depth interaction from
[extend-hq File Upload, 21st.dev demo 21308](https://21st.dev/@extend-hq/components/file-upload-2).
The component was retrieved through the authenticated 21st MCP on 25 October 2026.
Our implementation uses the existing React/Lucide/theme stack, a CSS border
animation and the actual upload lifecycle. It adds keyboard access, reduced
motion, visible validation and strict single-document payment imports.

Dense scanned payment tables formerly produced a single RGB OCR contact sheet
(96.4 MiB for one supplied example), besides the source render and Tesseract's
working memory. Reading now uses grayscale, frees the source pixmap immediately
and OCRs at most 48 cells per contact sheet (4.95 MiB). This supports up to
1,200 cells per scanned page instead of rejecting payment tables above 400 cells. OCR timeouts have an
actionable error. PDF imports still inspect every page, preserve source cells
and require confirmation. Empty PDFs cannot leave a broken empty import.

SERVICES batches pass their category to the reader. Recognized supplier/invoice
tables prefill a review grouped by supplier and invoice. Explicit project eligible
amounts have precedence over general reported amounts; HT/TTC invoice totals are
retained separately for source reconciliation and over-allocation checks.
Neither Qwen nor the total invoice amount supplies an allocation amount.
Ambiguous or missing fields remain subject to manual review.

Validation: 51 Python checks; real Worker/DB/R2 PDF import and revision tests;
browser checks for nested file drag, keyboard chooser, dark/mobile, reduced
motion, rejected files, Excel/PDF services imports and eligible amounts through
stamping. Container build additionally runs a 28-row scanned payment table with
real Tesseract under the production subprocess memory limit.
