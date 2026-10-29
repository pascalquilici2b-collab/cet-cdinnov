import io
from copy import deepcopy
import pytest
from openpyxl import Workbook
from cdi_facturx.stamping_import import inspect,read_table,review_import,combine_inspections
from cdi_facturx.stamping_layout import apply_layout,resolve_layouts

def workbook(rows,extra=None):
    book=Workbook();book.active.title='Paie'
    for row in rows:book.active.append(row)
    if extra:
        other=book.create_sheet('Autre tableau')
        for row in extra:other.append(row)
    out=io.BytesIO();book.save(out);return out.getvalue()

HEAD=['Intervenant désigné','Mois de rattachement','Dépense employeur complète','Action concernée','Somme présentée au financeur']
ROWS=[HEAD,['AGENT-A','janvier 2026',5000,'ALPHA',1250],['AGENT-B','février 2026',6000,'BETA',900]]
PLAN={'sheet':'Paie','orientation':'rows','header':0,'headerRows':1,'mapping':{'employee_ref':0,'period':1,'base_amount':2,'project_name':3,'allocation_amount':4},'fixed':{},'projects':[],'carry':[]}

def apply(rows,plan=None):
    raw=workbook(rows)
    return apply_layout(raw,'paiement.xlsx',read_table(raw,'paiement.xlsx'),plan or PLAN)

def test_unknown_vocabulary_candidates_and_original_values():
    raw=workbook(ROWS);inspected=inspect(raw,'paiement.xlsx')
    assert len(inspected['layoutCandidates'])==1
    evidence=str(inspected['layoutCandidates'])
    assert '5000' not in evidence and '1250' not in evidence
    result=resolve_layouts(raw,'paiement.xlsx',[PLAN])['suggestedImport']
    assert not result['errors'] and len(result['groups'])==2
    g=result['groups'][0]
    assert (g['employee_ref'],g['period'],g['base_amount_cents'],g['total_cents'])==('AGENT-A','2026-01',500000,125000)
    assert g['allocations'][0]['source']['cell']=='E2'
    assert not g['allocations'][0]['calculated']

def test_transposed_table_preserves_original_cell_addresses():
    result=apply(list(map(list,zip(*ROWS))),{**PLAN,'orientation':'columns'})
    assert [g['total_cents'] for g in result['groups']]==[125000,90000]
    assert result['groups'][0]['allocations'][0]['source']['cell']=='B5'

def test_multiple_project_columns_and_two_header_rows():
    rows=[['Intervenant','Mois','Coût employeur','Montants déclarés au projet',None],
          [None,None,None,'ALPHA','BETA'],['AGENT-A','janvier 2026',5000,1250,750]]
    plan={**PLAN,'headerRows':2,'mapping':{'employee_ref':0,'period':1,'base_amount':2},
          'projects':[{'source':{'cell':'D2','quote':'ALPHA'},'amountColumn':3},{'source':{'cell':'E2','quote':'BETA'},'amountColumn':4}]}
    g=apply(rows,plan)['groups'][0]
    assert [(a['project'],a['amount_cents'],a['source']['cell']) for a in g['allocations']]==[('ALPHA',125000,'D3'),('BETA',75000,'E3')]
    assert g['total_cents']==200000

def test_context_cell_and_month_blocks():
    rows=[['Action suivie : ALPHA'],HEAD[:3]+[HEAD[4]],['AGENT-A','janvier 2026',5000,1250],['AGENT-B',None,6000,900]]
    plan={**PLAN,'header':1,'mapping':{'employee_ref':0,'period':1,'base_amount':2,'allocation_amount':3},'fixed':{'project_name':{'cell':'A1','quote':'ALPHA'}},'carry':['period']}
    result=apply(rows,plan)
    assert not result['errors'] and len(result['groups'])==2
    assert all(g['period']=='2026-01' and g['allocations'][0]['project']=='ALPHA' for g in result['groups'])
    assert result['groups'][1]['allocations'][0]['source']['fields']['period']['cell']=='B3'

def test_empty_separator_prevents_inheriting_month():
    rows=[HEAD,ROWS[1],[],['AGENT-B',None,6000,'BETA',900]]
    result=apply(rows,{**PLAN,'carry':['period']})
    assert result['errors']
    assert len(result['groups'])==2 and result['groups'][1]['period']==''

def test_missing_project_or_amount_stays_editable_not_silently_skipped():
    rows=[HEAD,['AGENT-A','janvier 2026',5000,None,None]]
    result=apply(rows)
    assert result['errors'] and len(result['groups'])==1
    assert result['groups'][0]['allocations'][0]['amount_cents'] is None

@pytest.mark.parametrize('label',['Montant mensuel versé par employeur','Taxe sur salaire','Compensation abattement','Net à payer','Taux %'])
def test_wrong_monetary_column_is_rejected(label):
    rows=deepcopy(ROWS);rows[0][4]=label
    with pytest.raises(ValueError,match='confondus'):apply(rows)

def test_no_invented_values_negative_columns_or_duplicate_sources():
    for plan in [
        {**PLAN,'fixed':{'project_name':{'cell':'A2','quote':'INVENTED'}}},
        {**PLAN,'mapping':{**PLAN['mapping'],'allocation_amount':2}},
        {**PLAN,'fixed':{'allocation_amount':1234}},
        {**PLAN,'mapping':{**PLAN['mapping'],'allocation_amount':-1}},
    ]:
        with pytest.raises((ValueError,TypeError)):apply(ROWS,plan)

def test_omitted_sheet_blocks_confirmation_of_partial_result():
    raw=workbook(ROWS,ROWS)
    result=resolve_layouts(raw,'paiement.xlsx',[PLAN])['suggestedImport']
    assert len(result['groups'])==2
    assert result['errors']==[{'sheet':'Autre tableau','row':0,'message':'Organisation à préciser pour cette feuille.'}]

def test_multiple_tables_cannot_duplicate_a_plan():
    raw=workbook(ROWS)
    with pytest.raises(ValueError,match='dupliquée'):resolve_layouts(raw,'paiement.xlsx',[PLAN,PLAN])

def test_unresolved_pdf_page_is_not_silently_lost():
    raw=workbook(ROWS);part=resolve_layouts(raw,'paiement.xlsx',[PLAN])
    failed={'sha256':part['sha256'],'sheets':[{'name':'Page 2'}],'suggestedImport':None,'layoutIssues':[{'sheet':'Page 2','row':0,'message':'Organisation à préciser'}]}
    result=combine_inspections([part,failed])['suggestedImport']
    assert len(result['groups'])==2 and result['errors']==failed['layoutIssues']

def test_original_formulas_without_cached_value_remain_pending():
    rows=deepcopy(ROWS);rows[1][4]='=C2/4'
    result=apply(rows)
    assert result['errors'] and any(g['errors'] for g in result['groups'])

def test_corrected_pending_row_can_be_confirmed_without_reanalysis():
    result=apply([HEAD,['AGENT-A','janvier 2026',5000,None,None]])
    g=result['groups'][0];a=g['allocations'][0]
    result['errors'].append({'sheet':'Autre tableau','row':0,'message':'Feuille non lue'})
    corrected=review_import(result,[{'groupId':g['id'],'allocationId':a['id'],'project':'ALPHA','amount':'1250.00'}])
    assert corrected['groups'][0]['total_cents']==125000
    assert corrected['groups'][0]['errors']==[]
    assert corrected['errors']==[{'sheet':'Autre tableau','row':0,'message':'Feuille non lue'}]

def test_pdf_preserves_project_context_outside_grid():
    from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle
    from reportlab.lib.styles import ParagraphStyle
    from cdi_facturx.stamping_pdf import FONT
    out=io.BytesIO();style=ParagraphStyle('p',fontName=FONT,fontSize=10)
    table=Table([['Agent','Mois','Coût employeur','Montant rendu compte'],['AGENT-A','janvier 2026','5000,00','1250,00']],colWidths=[100,100,110,150])
    table.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,'black'),('FONTNAME',(0,0),(-1,-1),FONT),('FONTSIZE',(0,0),(-1,-1),9)]))
    SimpleDocTemplate(out).build([Paragraph('Paiement relatif au projet « ALPHA »',style),Spacer(1,12),table])
    result=inspect(out.getvalue(),'paiement.pdf')['suggestedImport']
    assert result and len(result['groups'])==1
    assert result['groups'][0]['allocations'][0]['project']=='ALPHA'
    assert result['groups'][0]['total_cents']==125000
