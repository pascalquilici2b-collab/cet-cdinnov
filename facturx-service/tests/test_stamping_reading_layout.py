import base64
import io
from copy import deepcopy
from pypdf import PdfReader
import pytest
from cdi_facturx.stamping_pdf import extract_fields,identity_matches,process,StampError
from test_stamping import pdf,groups

def test_employee_name_does_not_read_contribution_headers():
    reading=extract_fields('Bulletin de paie\nCotisations et contributions sociales Base Taux salarial Part salarié Part employeur\nBP 253 Madame MARTIN JEANNE\nPériode du 01/09/2024 au 30/09/2024\nMatricule : PERSON-01')
    assert reading['fields']['employee_name']=='MARTIN JEANNE'
    g=groups(1);g[0].update(employee_ref='Jeanne Martin',period='2024-09')
    assert identity_matches(reading,g)==g
    reading=extract_fields('Part salarié Part employeur\nSalarié : Jeanne Martin\nPériode : 2024-09\nBulletin de paie')
    assert reading['fields']['employee_name']=='Jeanne Martin'
    assert 'employee_name' not in extract_fields('Madame MARTIN JEANNE\nMadame MARTIN ANNE')['fields']

def test_stamp_fonts_phrase_and_euros():
    result=process(pdf(),groups(4))
    reader=PdfReader(io.BytesIO(base64.b64decode(result['pdf'])))
    spans=[]
    for page in reader.pages:page.extract_text(visitor_text=lambda text,cm,tm,font,size:spans.append((text,font.get('/BaseFont','') if font else '',size)))
    title=[s for s in spans if 'Dépense soutenue' in s[0]]
    assert title and 'Montserrat' in title[0][1] and title[0][2]==5.6 and 'Bold' in title[0][1]
    text=''.join(s[0] for s in spans)
    assert 'Dépense soutenue avec les fonds du PC Italie-France Maritime 2021-2027' in text
    assert '100,00 €' in text
    rows=[s for s in spans if 'Projet 1' in s[0] or '100,00 €' in s[0]]
    assert rows and all('Montserrat' in s[1] and s[2]==5 for s in rows)

def test_overlap_is_explicit_previewed_and_stays_on_page():
    raw=pdf(dense=True)
    with pytest.raises(StampError):process(raw,groups(),{'allowOverlap':False})
    result=process(raw,groups(),{'allowOverlap':True})
    assert len(PdfReader(io.BytesIO(base64.b64decode(result['pdf']))).pages)==1
    assert result['blocks'][0]['overlap'] is True
    assert all(result['checks'].values())
    assert process(raw,groups(),{'allowOverlap':True,'allowAppendix':True})['blocks'][0]['page']==1
    with pytest.raises(StampError):process(raw,groups(),{'allowOverlap':True,'placement':{'page':0,'x':-10,'y':300}})
    clean=process(pdf(),groups(4),{'allowOverlap':True})
    assert not any(b['overlap'] for b in clean['blocks'])

def test_incorrect_monthly_base_remains_blocked_after_name_repair():
    g=deepcopy(groups());g[0]['base_amount_cents']+=1
    with pytest.raises(StampError) as error:process(pdf(),g,{'allowOverlap':True})
    assert error.value.code=='BASE_MISMATCH'
