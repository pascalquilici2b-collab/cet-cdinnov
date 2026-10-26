from copy import deepcopy
from pathlib import Path
import pymupdf as fitz
from tests.test_billing_issuance import document
from tests.test_document_pdf import fixture, extract
from cdi_facturx.document_pdf import render_document
from cdi_facturx.billing_document import DraftDocument, PreviewRequest

def test_new_fields_quote_and_invoice():
    d,t=fixture('quote')
    d['details']={'marketObject':'Accord-cadre accompagnement européen','period':'S1','personInCharge':'Alex Exemple','fundingProgramme':'Interreg Italie-France Maritime','validityMonths':'3','returnEmail':'cdi@cdinnov.com','interventions':[{'id':'11111111-1111-4111-8111-111111111111','priceId':'tarif-1','label':'Assistance au projet','description':'Vérification des pièces et compte rendu de mission.','days':'2.5'}]}
    d['seller']['siren']='322556580'
    raw=render_document(d,t,number='DEVIS-TEST',editable=True)
    txt=extract(raw)
    assert 'IBAN' not in txt and d['iban'] not in txt and 'BC-000142' not in txt
    assert 'Relevé d’intervention' not in txt
    assert 'À retourner à : cdi@cdinnov.com' in txt
    assert 'Semestre 1' in txt and 'SIRET' in txt and 'Taux TVA' in txt
    with fitz.open(stream=raw,filetype='pdf') as pdf:
        links=[x['uri'] for p in pdf for x in p.get_links() if 'uri' in x]
        assert any(x.endswith('/lines.0.quantity') for x in links)
        assert any(x.endswith('/details.marketObject') for x in links)
    invoice=deepcopy(d);invoice['kind']='invoice';invoice['details']['validityMonths']=''
    invoice['references']['quoteNumber']='20261022-001'
    final=render_document(invoice,t,number='FACTURE-TEST',issued=True)
    assert 'IBAN' in extract(final) and 'BC-000142' in extract(final) and 'À retourner à : cdi@cdinnov.com' not in extract(final)
    assert 'Relevé d’intervention' not in extract(final) and 'Vérification des pièces' not in extract(final)  # separate attachment
    assert 'Référence devis : 20261022-001' in extract(final)
    with fitz.open(stream=final,filetype='pdf') as pdf:
        assert not [l for p in pdf for l in p.get_links()]
    out=Path('../platform/.private/modules-20261022/pdf');out.mkdir(parents=True,exist_ok=True)
    for name,data in [('devis',raw),('facture',final)]:
        (out/(name+'.pdf')).write_bytes(data)
        with fitz.open(stream=data,filetype='pdf') as pdf:
            for i,p in enumerate(pdf):p.get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(str(out/(name+f'-{i+1}.png')))

def test_quote_reference_preserves_legacy_hash_shape():
    d=document()
    assert 'quoteNumber' not in DraftDocument.model_validate(d).model_dump()['references']
    d['references']['quoteNumber']='20261022-001'
    assert DraftDocument.model_validate(d).model_dump()['references']['quoteNumber']=='20261022-001'

def test_reserved_number_and_payment_spacing():
    d,t=fixture('invoice')
    d['seller']['siren']='322556580'
    request=PreviewRequest.model_validate({'document':d,'number':'F-20261022-001','editable':True})
    raw=render_document(d,t,number=request.number,editable=True)
    text=extract(raw)
    assert 'F-20261022-001' in text and 'BROUILLON' in text
    assert 'Règlement et mentions' not in text
    assert 'Conditions de paiement' in text
    with fitz.open(stream=raw,filetype='pdf') as pdf:
        for page in pdf:
            bank=page.search_for('BIC :')
            legal=page.search_for('Indemnité de recouvrement :')
            if bank and legal:
                assert legal[0].y0-bank[-1].y1>=40
                break
        else:
            raise AssertionError('Bank and legal notes should be separated visibly on the sample invoice')
