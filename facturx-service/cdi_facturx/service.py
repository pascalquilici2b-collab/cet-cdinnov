import hashlib
import io
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from importlib.metadata import version

from facturx import generate_from_file
from lxml import etree
from pypdf import PdfReader
from .models import GenerationRequest
from .pdf_import import extract_pdf, check_source
from .xml_invoice import create_xml

ROOT = Path(__file__).resolve().parent.parent
LOG = logging.getLogger('cdi_facturx')


class ConversionError(Exception):
    def __init__(self, stage, message, details=None, unavailable=False):
        self.stage, self.message, self.details, self.unavailable = stage, message, details or [], unavailable
        super().__init__(message)


def runtime():
    path = ROOT / 'runtime.local.json'
    cfg = json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else {}
    for key in ('ghostscript', 'icc', 'java', 'verapdf_jar'):
        cfg[key] = os.getenv('FACTURX_' + key.upper(), cfg.get(key, ''))
    return cfg


def health():
    cfg = runtime()
    checks = {k: bool(v) and Path(v).is_file() for k, v in cfg.items() if k in ('ghostscript', 'icc', 'java', 'verapdf_jar')}
    return {'ready': len(checks) == 4 and all(checks.values()), 'tools': checks, 'factur_x': version('factur-x')}


def run(args, timeout=120, cwd=None):
    return subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=timeout, check=False,
                          creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)


def schematron(xml: bytes, profile: str, folder: Path):
    source = folder / 'factur-x.xml'
    source.write_bytes(xml)
    report = folder / 'schematron.json'
    result = run([sys.executable, '-m', 'cdi_facturx.validate_worker', str(source), profile, str(report)], cwd=ROOT)
    if result.returncode != 0 or not report.exists():
        raise ConversionError('schematron', 'Le moteur de validation XML a échoué ; génération bloquée.', unavailable=True)
    parsed = json.loads(report.read_text(encoding='utf-8'))
    if set(parsed.get('checks', {})) != {'schematron', 'france'}:
        raise ConversionError('schematron', 'Rapport de validation incomplet.', unavailable=True)
    if not all(parsed['checks'].values()):
        raise ConversionError('schematron', 'Le XML ne passe pas les règles Factur-X / France.', parsed['errors'])
    return parsed


def convert_pdfa(pdf: bytes, folder: Path, cfg):
    source, output = folder / 'source.pdf', folder / 'archive.pdf'
    source.write_bytes(pdf)
    shutil.copyfile(cfg['icc'], folder / 'srgb.icc')
    # Fixed filenames and cwd keep user strings outside PostScript and command arguments.
    (folder / 'pdfa.ps').write_text('''%!PS
/ICCProfile (srgb.icc) def
[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} << /N 3 >> /PUT pdfmark
[{icc_PDFA} ICCProfile (r) file /PUT pdfmark
[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[{OutputIntent_PDFA} << /Type /OutputIntent /S /GTS_PDFA1
/DestOutputProfile {icc_PDFA} /OutputConditionIdentifier (sRGB) >> /PUT pdfmark
[{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark
''', encoding='ascii')
    args = [cfg['ghostscript'], '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dPDFA=3',
            '-dPDFACompatibilityPolicy=1', '-sDEVICE=pdfwrite', '-sColorConversionStrategy=RGB',
            '-dEmbedAllFonts=true', '-dAutoRotatePages=/None', '--permit-file-read=srgb.icc',
            '-sOutputFile=archive.pdf', 'pdfa.ps', 'source.pdf']
    result = run(args, cwd=folder)
    if result.returncode or not output.exists():
        raise ConversionError('pdfa', 'La conversion PDF/A-3 a échoué.')
    return output


def validate_pdfa(path, folder, cfg):
    result = run([cfg['java'], '-jar', cfg['verapdf_jar'], '--format', 'xml', '--flavour', '3b', str(path)])
    (folder / 'verapdf.xml').write_bytes(result.stdout)
    try:
        root = etree.fromstring(result.stdout, etree.XMLParser(resolve_entities=False, no_network=True))
    except etree.XMLSyntaxError as exc:
        raise ConversionError('pdfa', 'veraPDF n’a pas renvoyé un rapport exploitable.', unavailable=True) from exc
    reports = root.xpath('//*[local-name()="validationReport"]')
    if result.returncode or len(reports) != 1 or reports[0].get('isCompliant') != 'true':
        failures = [{'code': r.get('clause', 'PDFA'), 'message': ' '.join(r.xpath('./*[local-name()="description"]/text()'))}
                    for r in root.xpath('//*[local-name()="rule" and @status="failed"]')]
        raise ConversionError('pdfa', 'Le PDF final ne passe pas la validation PDF/A-3b.', failures)
    return result.stdout


def verify_attachment(data: bytes, xml: bytes, profile: str):
    reader = PdfReader(io.BytesIO(data))
    embedded = list(reader.attachments.get('factur-x.xml', []))
    if embedded != [xml] or set(reader.attachments) != {'factur-x.xml'}:
        raise ConversionError('embedding', 'Le XML embarqué ne correspond pas au XML validé.')
    relation = '/Data' if profile == 'basicwl' else '/Alternative'
    af = reader.trailer['/Root'].get('/AF', [])
    if hasattr(af, 'get_object'):
        af = af.get_object()
    if len(af) != 1 or af[0].get_object().get('/AFRelationship') != relation:
        raise ConversionError('embedding', 'Association PDF/XML incorrecte.')
    xmp = etree.fromstring(reader.trailer['/Root']['/Metadata'].get_data())
    ns = {'fx': 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#'}
    expected_level = {'basicwl': 'BASIC WL', 'basic': 'BASIC', 'en16931': 'EN 16931'}[profile]
    for field, expected in [('ConformanceLevel', expected_level), ('DocumentFileName', 'factur-x.xml'), ('DocumentType', 'INVOICE')]:
        if xmp.xpath(f'//fx:{field}/text()', namespaces=ns) != [expected]:
            raise ConversionError('embedding', f'Métadonnée Factur-X incorrecte : {field}.')


def generate(data: bytes, request: GenerationRequest):
    stage = 'source'
    try:
        extracted = extract_pdf(data)
        if request.source_sha256 != extracted['source_sha256']:
            raise ValueError('Le PDF a changé depuis sa vérification. Réimportez-le.')
        corrections = check_source(request.invoice, extracted, request.source_corrections)
        amount_differences = [item for item in corrections if item['field'].startswith('totals.')]
        retained_pdf_differences = bool(request.invoice.allowance and amount_differences)
        if retained_pdf_differences and not request.pdf_differences_acknowledged:
            raise ValueError('La remise modifie les montants du XML sans modifier le PDF. Confirmez explicitement les écarts affichés avant de convertir.')
        if not health()['ready']:
            raise ConversionError('configuration', 'Ghostscript, Java ou veraPDF n’est pas configuré.', unavailable=True)
        cfg = runtime()
        with tempfile.TemporaryDirectory(prefix='cdi-facturx-') as tmp:
            folder = Path(tmp)
            stage = 'xsd'
            xml = create_xml(request.invoice, request.profile)
            stage = 'schematron'
            xml_report = schematron(xml, request.profile, folder)
            stage = 'pdfa'
            archived = convert_pdfa(data, folder, cfg)
            final = folder / 'final.pdf'
            stage = 'embedding'
            generate_from_file(str(archived), xml, output_pdf_file=str(final), flavor='factur-x',
                               level=request.profile, check_xsd=True, check_schematron=False,
                               afrelationship='data' if request.profile == 'basicwl' else 'alternative', lang='fr-FR')
            final_bytes = final.read_bytes()
            verify_attachment(final_bytes, xml, request.profile)
            stage = 'pdfa'
            vera_report = validate_pdfa(final, folder, cfg)
            if len(PdfReader(io.BytesIO(final_bytes)).pages) != extracted['pages']:
                raise ConversionError('pdfa', 'Le nombre de pages a changé pendant la conversion.')
            report = {'valid': True, 'profile': request.profile, 'checked_at': datetime.now(timezone.utc).isoformat(),
                      'checks': {'source_review': True, 'amounts': True, 'xsd': True, **xml_report['checks'], 'embedding': True, 'pdfa_3b': True},
                      'source_sha256': request.source_sha256, 'pdf_sha256': hashlib.sha256(final_bytes).hexdigest(),
                      'xml_sha256': hashlib.sha256(xml).hexdigest(), 'factur_x_version': version('factur-x'),
                      'warnings': xml_report['warnings'] + ([{'code':'HUMAN_CORRECTION','message':f'{len(corrections)} valeur(s) reconnue(s) ont été corrigées et confirmées lors de la relecture.'}] if corrections else []) + ([{'code':'PDF_XML_AMOUNT_DIFFERENCE','message':'La remise est incluse dans le XML. Le PDF original conserve ses montants différents, explicitement acceptés lors de la relecture. Les contrôles techniques ne garantissent pas l’acceptation de cet écart par le destinataire.'}] if retained_pdf_differences else []),
                      'source_corrections': corrections, 'agiris_acceptance': 'not_tested',
                      'identity_check': 'format_and_checksum_only',
                      'visual_consistency': 'pdf_xml_differences_acknowledged' if retained_pdf_differences else 'human_review_required',
                      'pdf_differences_acknowledged': retained_pdf_differences,
                      'allowance': request.invoice.allowance.model_dump(mode='json') if request.invoice.allowance else None}
            LOG.info('conversion_success profile=%s', request.profile)
            safe_number = re.sub(r'[^A-Za-z0-9_-]+', '-', request.invoice.number).strip('-') or 'facture'
            return {'pdf': final_bytes, 'xml': xml, 'report': report, 'verapdf': vera_report,
                    'filename': f'{safe_number}-Factur-X-{request.profile}.pdf'}
    except ConversionError:
        LOG.warning('conversion_blocked stage=%s', stage)
        raise
    except subprocess.TimeoutExpired as exc:
        raise ConversionError(stage, 'Le contrôle a dépassé le délai autorisé ; aucun fichier délivré.', unavailable=True) from exc
    except Exception as exc:
        LOG.warning('conversion_blocked stage=%s error_type=%s', stage, type(exc).__name__)
        # XSD/model errors help correction; no payload is written to technical logs.
        raise ConversionError(stage, str(exc)[:3000]) from exc
