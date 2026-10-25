/** Display only: persisted periods remain YYYY-MM for matching and corrections. */
export function stampingPeriod(value:string|undefined|null){
 if(!value||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return value||'';
 const label=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z'));
 return label.charAt(0).toLocaleUpperCase('fr')+label.slice(1);
}
