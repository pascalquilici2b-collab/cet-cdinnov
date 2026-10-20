import {useState} from 'react';

const brands:[string,string[],string[]?][]=[
 ['adec.svg',['Agence de développement économique de la Corse','Agence développement économique Corse'],['ADEC']],
 ['cci-corse.webp',['CCI de Corse','Chambre de commerce et d’industrie de Corse','EPCI de Corse'],['CCI Corse']],
 ['cci-var.webp',['CCI du Var','Chambre de commerce et d’industrie du Var'],['CCI Var']],
 ['cress.webp',['CRESS Corsica','Chambre régionale de l’économie sociale et solidaire de Corse'],['CRESS','CRESS Corse']],
 ['oec.webp',['Office de l’environnement de la Corse','Office environnement Corse'],['OEC']],
 ['atc.webp',['Agence du tourisme de la Corse','Agence tourisme Corse'],['ATC']],
 ['cci-nice.svg',['CCI Nice Côte d’Azur','Chambre de commerce et d’industrie Nice Côte d’Azur'],['CCI Nice']],
 ['cma.webp',['Chambre de métiers et de l’artisanat de Corse','Chambre de métiers et de l’artisanat de région Corse'],['CMA','CMA Corse']],
 ['collectivite-corse.webp',['Collectivité de Corse'],['CDC']],
 ['cab.webp',['Communauté d’agglomération de Bastia','Communauté agglomération de Bastia'],['CAB']],
 ['ccirb.webp',['Communauté de communes de L’Île-Rousse – Balagne','Communauté de communes Ile Rousse Balagne'],['CCIRB']],
 ['var.webp',['Département du Var','Département Var'],['CD83','CD 83']],
 ['ot-bastia.webp',['Office de tourisme de Bastia','Office de tourisme intercommunal de Bastia'],['OT Bastia']],
 ['atemis.webp',['ATEMIS · RED SAS','RED SAS'],['ATEMIS']],
 ['ajaccio.webp',['Ville d’Ajaccio','Commune d’Ajaccio','Commune de Ajaccio'],[]],
 ['cci-paca.svg',['CCI Provence-Alpes-Côte d’Azur','Chambre de commerce et d’industrie de région Provence Alpes Côte d’Azur'],['CCI PACA']],
 ['capa.webp',['Communauté d’agglomération du Pays Ajaccien','Communauté agglomération Pays Ajaccien'],['CAPA']],
 ['lycee.webp',['Lycée maritime de Bastia','Lycée professionnel maritime et aquacole de Bastia'],[]],
 ['smilo.webp',['SMILO · Small Islands Organisation','Small Islands Organisation'],['SMILO']],
 ['cpme.webp',['CGPME / CPME'],['CGPME','CPME']],
 ['sud.svg',['Région Sud · Provence-Alpes-Côte d’Azur','Région Provence Alpes Côte d’Azur'],['Région Sud','Région PACA']],
 ['nice-metropole.svg',['Métropole Nice Côte d’Azur'],[]],
 ['otc.webp',['Office des transports de la Corse','Office transports Corse'],['OTC']],
 ['littoral.webp',['Conservatoire du littoral','Conservatoire de l’espace littoral et des rivages lacustres'],[]],
 ['pnrc.webp',['Parc naturel régional de Corse','Syndicat mixte du parc naturel régional de Corse'],['PNRC']],
];
const key=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function clientLogo(name:string,identifier=''):string|undefined {
 const normalized=key(name);if(!normalized)return;
 // Short aliases serve the existing local directory only, never anonymous company search hits.
 const brand=brands.find(([,names,aliases])=>names.some(n=>key(n)===normalized)||(!identifier&&aliases?.some(n=>key(n)===normalized)));
 return brand?'platform/client-logos/'+brand[0]:undefined;
}
export function ClientAvatar({name,identifier=''}:{name:string;identifier?:string}){
 const source=clientLogo(name,identifier),[failed,setFailed]=useState('');
 return <span className={'bill-directory-monogram'+(source&&source!==failed?' bill-client-logo':'')} aria-hidden="true">{source&&source!==failed?<img src={source} alt="" width={48} height={48} loading="lazy" onError={()=>setFailed(source)}/>:name.trim().slice(0,2).toUpperCase()||'·'}</span>;
}
