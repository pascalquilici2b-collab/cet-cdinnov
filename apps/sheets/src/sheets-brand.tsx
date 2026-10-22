/** The same mark and wordmark are used on the login, navigation and workspace. */
export function SheetsBrand({symbolOnly=false}:{symbolOnly?:boolean}){
 return <span className="cdi-sheets-brand" aria-label="CDInnovSheets">
  <img src="/design/brand/assets/logos/cdinnov-sheets-symbol.svg" width="36" height="29" alt=""/>
  {!symbolOnly&&<span>CDInnov<span className="cdi-sheets-word">Sheets</span></span>}
 </span>;
}
