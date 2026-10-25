"""Read allocation grids, preserving merged-cell geometry and source locations."""
from contextlib import redirect_stdout
import csv
import io
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw


def clusters(values, gap=3):
    groups = []
    for value in values:
        if not groups or value > groups[-1][-1] + gap:
            groups.append([value])
        else:
            groups[-1].append(value)
    return [round(sum(g) / len(g)) for g in groups]


def scan_grid(page):
    """OCR once per page, then associate words with ruled/merged cells."""
    pix = page.get_pixmap(matrix=pymupdf.Matrix(4, 4), colorspace=pymupdf.csGRAY, alpha=False)
    image = Image.frombytes('L', (pix.width, pix.height), pix.samples)
    del pix
    small = image.convert('L'); small.thumbnail((1100, 1100))
    w, h = small.size
    mask = small.point(lambda p: 0 if p < 170 else 255)
    xs = clusters([x for x in range(w) if sum(len(m[0]) for m in re.finditer(b'\x00{20,}', mask.crop((x, 0, x+1, h)).tobytes())) > h * .04], 4)
    if len(xs) < 5:
        return []
    # All columns are read structurally; only the identified allocation columns
    # are retained by normalization. Short text strokes cannot form grid edges.
    boundaries = []
    for left, right in zip(xs, xs[1:]):
        if right-left < 20:
            return []
        boundaries.append(clusters([y for y in range(h) if max((len(m[0]) for m in re.finditer(b'\x00+',mask.crop((left+3,y,right-3,y+1)).tobytes())),default=0) >= (right-left-6)*.42], 2))
    if sum(len(b) > 5 for b in boundaries) < 2:
        return []
    binary = shutil.which('tesseract')
    if not binary:
        raise ValueError('Lecture des tableaux scannés indisponible : OCR requis.')
    sx, sy = image.width/w, image.height/h
    # OCR cells on a clean contact sheet. Borders stay outside the crops and
    # merged names/months are recognized once, then assigned by cell geometry.
    ys = clusters(sorted(y for b in boundaries[3:6] for y in b),3) if len(boundaries)>5 else max(boundaries,key=len)
    slots = {}; links = []
    for top,bottom in zip(ys,ys[1:]):
        row=[];middle=(top+bottom)/2
        for i,bounds in enumerate(boundaries):
            interval=(top,bottom) if i>=3 else next(((a,b) for a,b in zip(bounds,bounds[1:]) if a<=middle<=b),None)
            if not interval:row.append(None);continue
            identity=(i,*interval)
            if identity not in slots:slots[identity]=len(slots)
            row.append(slots[identity])
        links.append(row)
    if len(slots)>400:raise ValueError('Tableau scanné trop dense. Utilisez sa version Excel.')
    tile_w,tile_h,cols=600,180,4
    texts={}
    # Bounded grayscale tiles avoid a 100+ MB canvas and Tesseract's much
    # larger working buffers on dense payment tables. Keep original cell IDs.
    entries=list(slots.items());chunk_size=48
    with tempfile.TemporaryDirectory(prefix='cdi-table-') as folder:
        for start in range(0,len(entries),chunk_size):
            chunk=entries[start:start+chunk_size]
            with Image.new('L',(cols*tile_w,((len(chunk)+cols-1)//cols)*tile_h),'white') as canvas:
                for local,((i,a,b),slot) in enumerate(chunk):
                    box=(round((xs[i]+3)*sx),round((a+2)*sy),round((xs[i+1]-3)*sx),round((b-2)*sy))
                    if box[2]<=box[0] or box[3]<=box[1]:continue
                    with image.crop(box) as crop:
                        ink=crop.point(lambda p:255 if p<180 else 0).getbbox()
                        if not ink:continue
                        with crop.crop(ink) as content:
                            content.thumbnail((tile_w-36,tile_h-32))
                            canvas.paste(content,(local%cols*tile_w+18,local//cols*tile_h+16))
                source=Path(folder)/'cells.png';canvas.save(source)
            try:
                result=subprocess.run([binary,str(source),'stdout','-l','fra+eng','--psm','11','tsv'],capture_output=True,timeout=25,check=True)
            except subprocess.TimeoutExpired as exc:
                raise ValueError('Lecture du tableau scanné trop longue. Réessayez ou importez sa version Excel.') from exc
            except subprocess.CalledProcessError as exc:
                raise ValueError('La lecture du tableau scanné a échoué. Réessayez ou importez sa version Excel.') from exc
            for word in csv.DictReader(io.StringIO(result.stdout.decode('utf-8')),delimiter='\t',quoting=csv.QUOTE_NONE):
                if word.get('level')!='5' or not word.get('text','').strip():continue
                x=int(word['left'])+int(word['width'])/2;y=int(word['top'])+int(word['height'])/2
                local=int(y//tile_h)*cols+int(x//tile_w)
                if 0<=local<len(chunk):texts.setdefault(chunk[local][1],[]).append((round(y/8),x,word['text']))
    contents={slot:' '.join(t[2] for t in sorted(tokens)) for slot,tokens in texts.items()}
    image.close();small.close();mask.close()
    return [[contents.get(slot,'') for slot in row] for row in links]


def pdf_tables(raw, only_page=None):
    if not raw.startswith(b'%PDF-'):
        raise ValueError('Tableau PDF invalide.')
    book = {}
    with pymupdf.open(stream=raw, filetype='pdf') as doc:
        if doc.needs_pass or not 1 <= len(doc) <= 30:
            raise ValueError('Tableau PDF limité à 30 pages et non chiffré.')
        for p, page in enumerate(doc):
            if only_page is not None and p!=only_page:continue
            if max(page.rect.width, page.rect.height) > 2000:
                raise ValueError('Page de tableau trop grande.')
            tables = []
            if len(page.get_text().strip()) > 20:
                with redirect_stdout(io.StringIO()):
                    detected=page.find_tables()
                for table in detected.tables:
                    data = table.extract()
                    if not data or table.col_count < 4:
                        continue
                    # A value is propagated only within its actual merged cell.
                    for r, row in enumerate(data):
                        for c, value in enumerate(row):
                            if value is not None:
                                continue
                            y = (table.rows[r].bbox[1]+table.rows[r].bbox[3])/2
                            for previous in range(r-1,-1,-1):
                                box = table.rows[previous].cells[c]
                                if box and box[1] <= y <= box[3]:
                                    row[c] = data[previous][c]; break
                    tables.append(data)
            # Scanned pages sometimes contain a poor pre-existing OCR layer.
            # Re-read those from pixels rather than trusting merged OCR text.
            from .stamping_import import detect
            def recognized(table):
                mapping=detect([[{'value':v} for v in r] for r in table])[1]
                return all(f in mapping for f in ['project_name','allocation_amount']) and (all(f in mapping for f in ['employee_ref','period']) or all(f in mapping for f in ['supplier_ref','invoice_number']))
            if not any(recognized(t) for t in tables):
                data = scan_grid(page)
                if data:
                    tables = [data]
            for t, data in enumerate(tables):
                book[f'Page {p+1}'+(f' · tableau {t+1}' if t else '')] = [
                    [{'value': v or '', 'raw': v or '', 'format': '', 'cell': f'P{p+1}:L{r+1}:C{c+1}', 'pdf': True}
                     for c,v in enumerate(row)] for r,row in enumerate(data)]
    if not book and only_page is None:
        raise ValueError('Aucun tableau lisible. Ajoutez le fichier Excel ou un PDF plus net.')
    return book
