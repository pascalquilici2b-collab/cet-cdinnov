/* One authenticated response carries live milestones and the validated file. */
const CDIConversion = (() => {
  async function readStream(response, onProgress) {
    if (!response.ok) {
      let error;
      try { error = await response.json(); } catch { error = {message:'Le service est indisponible. Réessayez dans un instant.'}; }
      throw error;
    }
    if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) {
      throw new Error('Le service de conversion doit être actualisé. Réessayez dans un instant.');
    }
    const reader=response.body.getReader(), decoder=new TextDecoder();
    let pending='', lastCompleted=-1;
    function consume(line) {
      if(!line.trim())return;
      const event=JSON.parse(line);
      if(event.type==='error')throw event;
      if(event.type==='progress'){
        if(event.total!==6||!Number.isInteger(event.completed)||event.completed<0||event.completed>5||event.completed<lastCompleted)throw new Error('Suivi de conversion invalide. Réessayez.');
        lastCompleted=event.completed;onProgress(event);
      }
      if(event.type==='result'){
        const result=event.result;
        if(!result?.valid||!result.pdf_base64||!['source_review','amounts','xsd','schematron','france','embedding','pdfa_3b'].every(key=>result.checks?.[key]===true))throw new Error('Le fichier reçu est incomplet. Relancez la conversion.');
        return result;
      }
    }
    try {
      while(true){
        const {value,done}=await reader.read();
        pending+=decoder.decode(value,{stream:!done});
        let end;
        while((end=pending.indexOf('\n'))>=0){
          const line=pending.slice(0,end);pending=pending.slice(end+1);
          const result=consume(line);if(result)return result;
        }
        if(done){const result=consume(pending);if(result)return result;break;}
      }
      throw new Error('Connexion interrompue avant la fin de la conversion. Réessayez.');
    } finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
  }
  return {readStream};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CDIConversion;
