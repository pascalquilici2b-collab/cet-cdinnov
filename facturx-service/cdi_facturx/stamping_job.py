"""Bounded subprocess entry. stdin/stdout are private pipes, never application logs."""
import base64
import json
import sys
from .stamping_import import inspect, normalize
from .stamping_pdf import extract, process, preview, StampError

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
        if action=='inspect':result=inspect(raw,request['name'])
        elif action=='import':result=normalize(raw,request['name'],options)
        elif action=='extract':result=extract(raw)
        elif action=='process':result=process(raw,request['groups'],options,request.get('choice'),request.get('suggestions'),request.get('overrides'))
        elif action=='preview':result={'image':base64.b64encode(preview(raw,options.get('page',0))).decode()}
        else:raise ValueError('Action inconnue.')
        sys.stdout.write(json.dumps({'ok':True,'result':result},ensure_ascii=False))
    except StampError as exc:sys.stdout.write(json.dumps({'ok':False,'code':exc.code,'message':str(exc)},ensure_ascii=False))
    except (ValueError,KeyError,TypeError) as exc:sys.stdout.write(json.dumps({'ok':False,'code':'INVALID_INPUT','message':str(exc)[:300]},ensure_ascii=False))
    except Exception:sys.stdout.write(json.dumps({'ok':False,'code':'PROCESSING_FAILED','message':'Le document ne peut pas être traité. Vérifiez le fichier source.'}))

if __name__=='__main__':main()
