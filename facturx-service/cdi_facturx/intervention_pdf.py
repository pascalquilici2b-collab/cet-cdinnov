"""Standalone intervention report. Does not issue or modify an invoice."""
from datetime import date
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, KeepTogether
from .document_pdf import (_styles, _markup, _check_tree, _date, _decimal, _text,
                           _MARGIN, _WIDTH, _PAGE_H, _PAGE_W, _LOGO_PATH, _ACCENT,
                           _RULE, _FONT_NAME, _DocumentCanvas, DocumentPDFError)


def render_intervention_report(document: dict, number: str, report_date: str) -> bytes:
    date.fromisoformat(report_date)
    if document.get('kind') != 'invoice' or not number.strip() or len(number) > 80:
        raise DocumentPDFError('Le relevé doit être rattaché à une facture numérotée.')
    _check_tree(document)
    _check_tree(number)
    details = document.get('details') or {}
    rows = details.get('interventions', [])
    if not rows or len(rows) > 200:
        raise DocumentPDFError('Renseignez les interventions du relevé.')
    styles = _styles()
    p = lambda value, variant='body': Paragraph(_markup(str(value)), styles[variant])
    stream = BytesIO()
    pdf = SimpleDocTemplate(stream, pagesize=A4, leftMargin=_MARGIN, rightMargin=_MARGIN,
                            topMargin=85, bottomMargin=58, title='Relevé d’intervention — ' + number,
                            author=_text(document['seller'].get('name')))

    def frame(canvas, doc):
        canvas.saveState()
        canvas.drawImage(str(_LOGO_PATH), _MARGIN, _PAGE_H - 65, width=162, height=32, mask='auto')
        canvas.setStrokeColor(_RULE)
        canvas.line(_MARGIN, 40, _PAGE_W - _MARGIN, 40)
        canvas.setFont(_FONT_NAME, 7)
        canvas.setFillColor(_ACCENT)
        canvas.drawString(_MARGIN, 28, 'Conseil Développement Innovation')
        canvas.restoreState()

    story = [p('Relevé d’intervention relatif à la facture ' + number, 'title'),
             p('Date du relevé : ' + _date(report_date), 'small'),
             p('Date du document : ' + _date(document.get('issueDate')), 'small')]
    if document.get('title'):
        story.extend([Spacer(1, 10), p(document['title'], 'heading')])
    if document.get('buyer', {}).get('name'):
        story.append(p('Client : ' + document['buyer']['name']))
    project = (document.get('references') or {}).get('project')
    if project:
        story.append(p('Projet : ' + project))
    periods = details.get('periods', [details['period']] if details.get('period') else [])
    numbers = [str(n) for n in range(1, 9) if f'S{n}' in periods]
    if numbers:
        label = 'Semestre ' + numbers[0] if len(numbers) == 1 else 'Semestres ' + ', '.join(numbers[:-1]) + ' et ' + numbers[-1]
        story.append(p('Période concernée : ' + label))
    table_rows = [[p(v, 'tablehead') for v in ('Prestation', 'Travail effectué', 'Jours')]]
    for row in rows:
        if not row['label'].strip() or not row['description'].strip():
            raise DocumentPDFError('Complétez la prestation et le travail effectué.')
        table_rows.append([p(row['label'], 'cell'), p(row['description'], 'cell'), p(_decimal(row['days']), 'numeric')])
    table = LongTable(table_rows, colWidths=[145, _WIDTH-195, 50], repeatRows=1, splitByRow=1, splitInRow=1)
    table.setStyle([('BACKGROUND',(0,0),(-1,0),_ACCENT),('VALIGN',(0,0),(-1,-1),'TOP'),
                    ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f7fafa')]),
                    ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
                    ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
                    ('LINEBELOW',(0,1),(-1,-1),.35,_RULE)])
    story.extend([Spacer(1,16),table,KeepTogether([Spacer(1,24),p('Certifie que les prestations décrites ci-dessus ont été intégralement réalisées et exécutées conformément aux besoins exprimés.', 'small')])])
    pdf.build(story,onFirstPage=frame,onLaterPages=frame,canvasmaker=_DocumentCanvas)
    return stream.getvalue()
