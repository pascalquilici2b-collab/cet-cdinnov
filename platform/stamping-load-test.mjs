import assert from 'node:assert/strict';
import {stampEnvironment,py} from './stamping-test-helper.mjs';
const count=Number(process.env.STAMP_TEST_COUNT||20);assert.ok(Number.isInteger(count)&&count>=20&&count<=100);
const start=Date.now(),ctx=await stampEnvironment();
const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
try{
 const fixture=JSON.parse(await py(['-c',`import runpy,json,base64; m=runpy.run_path('tests/test_stamping.py'); rows=[]; docs=[]
for i in range(${count}):
 kind='INVOICE' if i%2 else 'PAYSLIP'; source=m['pdf'](kind,dense=i==18); tab=m['table'](kind=kind); old=b'F-TEST' if i%2 else b'SAL-TEST'; new=(('F-' if i%2 else 'SAL-')+str(i)).encode(); from pypdf import PdfReader,PdfWriter; from reportlab.pdfgen import canvas; import io
 # Distinct documents without touching real data: retain fixture identity and distinguish groups by employee/ref.
 out=io.BytesIO(); c=canvas.Canvas(out,pagesize=(595,842)); c.setFont(m['FONT'],11); lines=['Facture n: '+new.decode(),'Fournisseur : FOURNISSEUR-TEST','Total HT : 7 177,10 EUR'] if i%2 else ['Bulletin de paie','Matricule : '+new.decode(),'Période : 2026-01','Total versé par l’employeur : 7 177,10 EUR']
 if i%2:lines[0]='Facture n° '+new.decode()
 for j,line in enumerate(lines):c.drawString(30,800-j*22,line)
 if i==18:
  for y in range(10,710,10):c.drawString(10,y,'ZONE OCCUPEE '*10)
 c.save(); docs.append(base64.b64encode(out.getvalue()).decode());rows.extend(tab.replace(old,new).decode().split('\\n')[1:])
print(json.dumps({'docs':docs,'csv':m['HEADER']+'\\n'+'\\n'.join(rows)}))` ]));
 const id=(await read(await ctx.send('/batches',{name:`Charge : ${count} pièces fictives`,useAI:false}),201)).id;
 await read(await ctx.upload(`/batches/${id}/table`,Buffer.from(fixture.csv),'repartition.csv',1));let b=await read(await ctx.call('/batches/'+id)),s=b.data.table.sheets[0];
 await read(await ctx.send(`/batches/${id}/mapping`,{mapping:{sheet:s.name,mapping:s.mapping,header:0},confirmed:true},b.version));
 for(let i=0;i<fixture.docs.length;i++)await read(await ctx.upload(`/batches/${id}/documents`,Buffer.from(fixture.docs[i],'base64'),`piece-${i}.pdf`),201);
 b=await read(await ctx.call('/batches/'+id));for(const d of b.documents)await read(await ctx.send(`/batches/${id}/documents/${d.id}/analyze`,{},d.version),202);
 const deadline=Date.now()+180000;
 do{await new Promise(r=>setTimeout(r,500));b=await read(await ctx.call('/batches/'+id));if(b.documents.every(d=>!['QUEUED','PROCESSING'].includes(d.status)))break;}while(Date.now()<deadline);
 assert.equal(b.documents.filter(d=>d.status==='NEEDS_APPROVAL').length,count-1,JSON.stringify(b.documents.map(d=>({name:d.name,status:d.status,error:d.data.error}))));
 assert.equal(b.documents.filter(d=>d.status==='REVIEW_REQUIRED').length,1);assert.equal(b.documents.find(d=>d.status==='REVIEW_REQUIRED').data.error.code,'NO_SAFE_AREA');
 assert.equal(ctx.aiCalls(),0);console.log(JSON.stringify({passed:true,pieces:count,ready:count-1,safeRefusals:1,elapsedSeconds:(Date.now()-start)/1000,nodePeakRssMiB:Math.round(process.resourceUsage().maxRSS/1024),ai:'disabled'}));
}finally{await ctx.worker.dispose();}
