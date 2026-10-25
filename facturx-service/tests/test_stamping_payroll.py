import io
import pytest
from reportlab.pdfgen import canvas
from cdi_facturx.stamping_payroll import employer_cost
from cdi_facturx.stamping_import import identify_header
from cdi_facturx.stamping_pdf import extract,process,StampError,FONT
from test_stamping import groups

@pytest.mark.parametrize('label',[
    'Montant total versé par l’employeur','Total versé par l\'employeur',
    'Montant mensuel versé par l’employeur','Coût total employeur',
    'Coût pour l’employeur','Coût global employeur','Salaire brut chargé',
])
def test_printed_monthly_employer_cost(label):
    r=employer_cost(label+' : 5 235,22 €\nSalaire net : 2 950,00 €')
    assert r['amount_cents']==523522 and r['method']=='printed_total'

@pytest.mark.parametrize('gross,charges',[
    ('Salaire brut','Charges patronales'),('Total brut','Total cotisations patronales'),
    ('Rémunération brute','Cotisations et contributions patronales'),
    ('Brut mensuel','Total part employeur'),('Montant brut','Cotisations employeur'),
])
def test_sum_monthly_gross_and_employer_contributions(gross,charges):
    r=employer_cost(gross+' : 3 800,00\n'+charges+' : 1 435,22\nNet imposable : 2 950,00\nCotisations salariales : 850,00\nCumul annuel brut : 34 200,00')
    assert r['amount_cents']==523522 and r['method']=='gross_plus_employer'
    assert r['components']=={'gross_cents':380000,'employer_contributions_cents':143522}

def test_total_has_priority_over_reconstruction():
    r=employer_cost('Total versé par l’employeur : 5 235,22\nSalaire brut : 3 800,00\nCharges patronales : 1 400,00')
    assert r['amount_cents']==523522 and r['method']=='printed_total'

@pytest.mark.parametrize('text',[
    'Salaire brut : 3 800,00\nCotisations salariales : 850,00',
    'Net à payer : 3 000,00\nCharges patronales : 1 435,22',
    'Salaire brut : 3 800,00\nCharges patronales annuelles : 14 352,20',
    'Cumul salaire brut : 38 000,00\nCharges patronales : 1 435,22',
    'Salaire brut : 3 800,00\nCharges patronales : 30,00 %',
    'Salaire brut : 3 800,00\nCharges patronales : 1 435,22\nCharges patronales : 1 400,00',
    'Total employeur annuel : 50 000,00',
    'Total versé par l’employeur : 5 000,00 50 000,00\nSalaire brut : 3 800,00\nCharges patronales : 1 400,00',
    'Total versé par l’employeur : 5 000,00\nTotal versé par l’employeur : 5 100,00',
    'Cumuls annuels\nSalaire brut : 38 000,00\nCharges patronales : 14 352,20',
])
def test_ambiguous_annual_net_or_employee_amounts_are_not_used(text):
    assert employer_cost(text) is None

def test_monthly_row_in_summary_table():
    text='Salaire brut   Cotisations salariales   Cotisations patronales   Net imposable\nMensuel 3 800,00 850,00 1 435,22 2 950,00\nAnnuel 38 000,00 8 500,00 14 352,20 29 500,00'
    assert employer_cost(text)['amount_cents']==523522

def test_annual_only_summary_never_used():
    assert employer_cost('Salaire brut   Cotisations patronales\nAnnuel 38 000,00 14 352,20') is None

def test_labels_on_separate_lines():
    assert employer_cost('Salaire brut\n3 800,00\nCharges patronales\n1 435,22')['amount_cents']==523522
    assert employer_cost('Montant total versé par l’employeur\n5.235,22 EUR')['amount_cents']==523522

def test_payment_table_header_aliases():
    for label in ['Montant mensuel versé par l’employeur','Salaire brut chargé','Brut chargé']:
        assert identify_header(label)[0]=='base_amount'
    assert identify_header('Montant total rendu compte sur le projet')[0]=='allocation_amount'

def payroll_pdf():
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(595,842));c.setFont(FONT,10)
    for i,line in enumerate(['Bulletin de paie - DOCUMENT FICTIF','Matricule : SAL-TEST','Période : 2026-01','Salaire brut : 5 000,00 EUR']):c.drawString(32,810-18*i,line)
    c.drawString(32,670,'Cotisations et contributions');c.drawString(360,670,'Part salarié');c.drawString(475,670,'Part employeur')
    c.drawString(32,630,'Total cotisations et contributions');c.drawRightString(415,630,'1 000,00');c.drawRightString(555,630,'2 177,10')
    c.drawString(32,100,'Cumul salaire brut annuel : 60 000,00 EUR');c.save();return out.getvalue()

def test_native_columns_and_stamping_with_computed_cost():
    raw=payroll_pdf();r=extract(raw);cost=r['bases']['EMPLOYER_COST']
    assert cost['amount_cents']==717710
    assert cost['components']=={'gross_cents':500000,'employer_contributions_cents':217710}
    result=process(raw,groups(),{'allowAppendix':True});assert result['base_cents']==717710 and result['total_cents']==645940
    assert all(result['checks'].values())
    g=groups();g[0]['base_amount_cents']=717711
    with pytest.raises(StampError) as e:process(raw,g)
    assert e.value.code=='BASE_MISMATCH'
