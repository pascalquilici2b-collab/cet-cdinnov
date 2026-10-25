"""Bounded subprocess entry. stdin/stdout are private pipes, never application logs."""
import base64
import json
import sys
from .stamping_import import inspect, normalize, review_import, combine_inspections
from .stamping_pdf import extract, process, analyze, revise, preview, StampError

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        # Limit address space on Linux. The process is disposable after every PDF.
        if sys.platform=='linux':
            import resource
            resource.setrlimit(resource.RLIMIT_AS,(384*1024*1024,384*1024*1024))
            resource.setrlimit(resource.RLIMIT_CPU,(85,90))
        request=json.loads(sys.stdin.buffer.read(30*1024*1024))
        raw=base64.b64decode(request.pop('file'),validate=True)
        action=request['action'];options=request.get('options',{})
        if action=='inspect':result=inspect(raw,request['name'],options)
        elif action=='combine':result=combine_inspections(request['parts'])
        elif action=='table-info':
            import pymupdf
            with pymupdf.open(stream=raw,filetype='pdf') as doc:
                if doc.needs_pass or not 1<=len(doc)<=30:raise ValueError('Tableau limité à 30 pages non chiffrées.')
                result={'pages':len(doc)}
        elif action=='review':result=review_import(request['original'],request.get('changes',[]))
        elif action=='import':result=normalize(raw,request['name'],options)
        elif action=='extract':result=extract(raw)
        elif action=='process':result=process(raw,request['groups'],options,request.get('choice'),request.get('suggestions'),request.get('overrides'))
        elif action=='analyze':result=analyze(raw,request['groups'],options,request.get('choice'),request.get('suggestions'),request.get('overrides'),request.get('cachedReading'))
        elif action=='revise':result=revise(raw,request['previous'],options,request.get('overrides'),request.get('additions'))
        elif action=='preview':result={'image':base64.b64encode(preview(raw,options.get('page',0))).decode()}
        else:raise ValueError('Action inconnue.')
        sys.stdout.write(json.dumps({'ok':True,'result':result},ensure_ascii=False))
    except StampError as exc:sys.stdout.write(json.dumps({'ok':False,'code':exc.code,'message':str(exc)},ensure_ascii=False))
    except (ValueError,KeyError,TypeError) as exc:sys.stdout.write(json.dumps({'ok':False,'code':'INVALID_INPUT','message':str(exc)[:300]},ensure_ascii=False))
    except Exception:sys.stdout.write(json.dumps({'ok':False,'code':'PROCESSING_FAILED','message':'Le document ne peut pas être traité. Vérifiez le fichier source.'}))

if __name__=='__main__':main()
