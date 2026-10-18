import * as XLSX from "xlsx";
import { parseGlobalExpenditureRows } from "./global-expenditures";

export async function readGlobalExpenditureFile(file:File){
  if(!/\.xlsx$/i.test(file.name)||file.size>30*1024*1024)throw new Error("Choisissez un fichier XLSX de moins de 30 Mo.");
  const bytes=await file.arrayBuffer();
  // Excel dates are calendar serials. Converting them to local Date objects first
  // would shift midnight to the preceding day when serialised in UTC.
  const workbook=XLSX.read(bytes,{type:"array",cellDates:false,sheetRows:20004});
  const sheet=workbook.Sheets["Expenditures data"];
  if(!sheet)throw new Error("Feuille « Expenditures data » absente : choisissez l’export global des dépenses JEMS.");
  const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:null,blankrows:true});
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
  return parseGlobalExpenditureRows(rows,file.name,hash);
}
