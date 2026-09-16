"""Run trusted, bundled Schematrons locally in an isolated Saxon process."""
import json
import sys
from pathlib import Path
import facturx.facturx as fx
from lxml import etree
from saxonche import PySaxonProcessor


def validate(xml_path: str, profile: str) -> dict:
    root = Path(fx.__file__).parent / 'xsd_and_schematron'
    sheets = {'schematron': root / fx.FACTURX_LEVEL2schematron[profile],
              'france': root / fx.CII_FR_CTC_schematron}
    report = {'checks': {}, 'errors': [], 'warnings': []}
    with PySaxonProcessor(license=False) as proc:
        engine = proc.new_xslt30_processor()
        for name, sheet in sheets.items():
            compiled = engine.compile_stylesheet(stylesheet_file=str(sheet))
            result = compiled.transform_to_string(source_file=xml_path)
            if not result:
                raise RuntimeError('Résultat Schematron vide.')
            svrl = etree.fromstring(result.encode('utf-8'))
            if etree.QName(svrl).localname != 'schematron-output':
                raise RuntimeError('Rapport Schematron non reconnu.')
            failures = svrl.xpath('//*[local-name()="failed-assert"]')
            errors = []
            for node in failures:
                item = {'stage': name, 'code': node.get('id', 'SCHEMATRON'),
                        'message': ' '.join(''.join(node.xpath('./*[local-name()="text"]//text()')).split()),
                        'location': node.get('location')}
                if node.get('flag', '').lower() in ('warning', 'info'):
                    report['warnings'].append(item)
                else:
                    errors.append(item)
            report['errors'].extend(errors)
            report['checks'][name] = not errors
    return report


if __name__ == '__main__':
    try:
        report = validate(sys.argv[1], sys.argv[2])
        Path(sys.argv[3]).write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
