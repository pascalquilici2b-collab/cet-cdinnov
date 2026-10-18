// Display names from the references on https://www.cdinnov.eu/ (24 September 2026).
// Only identified organisations are canonicalised. Unknown names remain unchanged.
export const nameKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9]+/g,' ').trim();
/** @type {Array<[string, string[]]>} */
export const clientCatalog = [
  ["Chambre de Commerce et d'Industrie de Corse", ['CCI Corse','CCI Haute Corse','CCI de la Haute Corse','CCI de Haute Corse','CCIC','CCIT Haute Corse','CCI 2A','CCI2A','CCI 2B','Chambre de commerce 2B','EPCI de Corse','EPCIC','Etablissement Public du Commerce','Etablissement Public du Commerce et de l Industrie de Corse','Etablissement public de Commerce et d Industrie de Corse','CCI Ajaccio et Corse du Sud','Chambre de Commerce Territoriale de Bastia et Hte Corse']],
  ["Chambre de métiers et de l'artisanat de Corse", ['CMAR Corse','CMARC','CMA Corse']],
  ["Agence de développement économique de la Corse", ['ADEC','Agence Developpement Economique de la Corse','Agence de Developpement de la Corse','Agence de Developpement Econimique de la Corse','Agence Developpement Econimique de la Corse','Agenge de Developpement Economique de la Corse']],
  ["Office de l'environnement de la Corse", ['OEC','Office Environnement de la Corse']],
  ["Agence du tourisme de la Corse", ['ATC']],
  ["Collectivité de Corse", ['CTC','CDC','Collectivité Territoriale de Corse','CG 2A','CG Corse du Sud','CG Haute Corse','Département Haute Corse','Conseil Départemental de la Haute Corse','Conseil Général de Corse du Sud','Conseil Général de la Corse du Sud','Conseil Général de la Corse duSud','Conseil Général de la Cors du Sud','Conseil Général de Haute Corse','Conseil Général Haute Corse','Conseil Général de la Haute Corse']],
  ["CCI du Var", ["Chambre de Commerce et d'Industrie du Var",'Chambre de Commerce et Industrie du Var','Chambre de Commerce du Var']],
  ["CCI Nice Côte d'Azur", ['CCI Nice Cote Azur']],
  ["CCI Provence-Alpes-Côte d'Azur", ['CCI région PACA','CCI PACA']],
  ["CRESS Corsica", ['CRESS Corse']],
  ["Communauté d'agglomération de Bastia", ['CAB','Communauté Agglomération Bastia','Communauté d Agglomération Bastia']],
  ["Communauté d'agglomération du Pays Ajaccien", ['CAPA','Com Agglo Pays Ajaccien','Comm Agglo Pays Ajaccien']],
  ["Communauté de communes de L'Île-Rousse – Balagne", ['Communauté de Communes Ile Rousse Balagne','Communauté de Communes Bassin Ile Rousse']],
  ["Département du Var", ['Conseil Départemental du Var']],
  ["Office de tourisme de Bastia", ["Office de tourisme de l'agglomération de Bastia","Office de tourisme d'agglomération de Bastia","Office de tourisme intercommunal de Bastia"]],
  ["ATEMIS · RED SAS", ['RED ATEMIS SAS','ATEMIS']],
  ["Ville d'Ajaccio", ["Commune d'Ajaccio","Mairie d'Ajaccio"]],
  ["Lycée maritime de Bastia", []],
  ["SMILO", ['Association SMILO','Small Islands Organisation']],
  ["CPME", ['CGPME','CPME Corsica','Confédration PME Corsica','Confédération petites et moyennes entreprises']],
  ["Région Sud – Provence-Alpes-Côte d'Azur", ['Conseil régional PACA','Région PACA']],
  ["Métropole Nice Côte d'Azur", ['Métropole NCA']],
  ["Office des transports de la Corse", ['Office des transport de la Corse']],
  ["Conservatoire du littoral", []],
  ["Parc naturel régional de Corse", ['PNRC']],
];
const known = clientCatalog.flatMap(([name,aliases]) => [name,...aliases].map(alias=>[nameKey(alias),name])).sort((a,b)=>b[0].length-a[0].length);
export function canonicalClientName(value) {
  const name=String(value || '').trim().replace(/\s+/g,' '), key=nameKey(name);
  // Former Corsican CCI branches and services all belong to the same directory entry.
  if(/^chambre de commerce(?: et (?:d )?industrie)? (?:(?:de|d) (?:la )?)?(?:corse|bastia|ajaccio|2a|2b)\b/.test(key)||/^chambre de commerce et industrie (?:daee|dcp|det|df|def|dpt|dpp)\b/.test(key))return clientCatalog[0][0];
  if(/^chambre (?:regionale? )?(?:de|des) metiers\b/.test(key)&&/\bcorse\b/.test(key))return clientCatalog[1][0];
  for(const [alias,canonical] of known)if(key===alias||key.startsWith(alias+' '))return canonical;
  return name;
}
export const sameClientName = (left,right) => nameKey(canonicalClientName(left))===nameKey(canonicalClientName(right));
export const validClientName = value => !!nameKey(value)&&!['annulee','annule','association','strategiques'].includes(nameKey(value))&&!/^n a ne pas utiliser\b/.test(nameKey(value));
