// Tax is optional: a missing rate is not evidence of zero tax.
export function sourcedVatRate(raw,amountMinor,quote,documentText,grossMinor=null){
 if(raw===null||raw===undefined||raw==='')return null;
 const value=Number(String(raw).replace(',','.'));
 if(!Number.isFinite(value)||value<0||value>100||Math.abs(Math.round(value*100)-value*100)>1e-7)return null;
 const rate=String(value).replace('.','[.,]')+'(?:[.,]0{1,2})?';
 const explicit=new RegExp('(?:TVA|taux\\s+de\\s+TVA)\\s*(?:[:=àa]|de)?\\s*'+rate+'(?![\\d.,])\\s*%?|(?<![\\d.,])'+rate+'\\s*%\\s*(?:de\\s*)?TVA','i');
 if(explicit.test(quote))return value;
 // In BPU/DQE tables the headings often sit outside the contiguous row citation.
 // Require all three row values and the HT/TVA/TTC relationship, never guess a rate.
 const header=/\bHT\b|hors taxes/i.test(documentText)&&/\bTVA\b/i.test(documentText)&&/\b[TI][TI]C\b/i.test(documentText);
 if(!header||amountMinor==null||grossMinor==null)return null;
 const tokens=[...quote.matchAll(/(?<![\d.,])\d+(?:[.,]\d{1,2})?(?![\d.,])/g)].map(m=>Math.round(Number(m[0].replace(',','.'))*100));
 const expected=Number((BigInt(amountMinor)*BigInt(10000+Math.round(value*100))+5000n)/10000n);
 return tokens.includes(Math.round(value*100))&&tokens.includes(amountMinor)&&tokens.includes(grossMinor)&&expected===grossMinor?value:null;
}
