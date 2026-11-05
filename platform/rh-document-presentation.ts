import {rhDate,type RhPeriod} from './rh-domain';

type PeriodDates=Pick<RhPeriod,'startDate'|'endDate'>;
const monthLabel=(date:string)=>new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));

export const rhAttestationTitle=(clientName:string)=>`Programme de coopération INTERREG : Attestation de paiement des ressources humaines de ${clientName}`;

/** Visible labels shared by the current preview, PDF and Excel presentation. */
export const rhPaymentTableLabels={
 rh:['Agent','Bulletins de salaire','Montant mensuel versé par l’employeur','Projet','% de temps de travail sur le projet','Montant total rendu-compte sur le projet'],
 groups:['Informations sur le paiement des SALAIRES','Informations sur le paiement des CHARGES'],
 salary:['N° de mandat de paiement','Date de paiement effectif','Montant du mandat de paiement'],
 contribution:['Organismes','Montant total versé aux organismes','Date de paiement effectif'],
} as const;

/** Each sheet has its own date range; unfinished dates remain explicit in the preview. */
export function rhAttestationText(clientName:string,periods:PeriodDates[]):string{
 const starts=periods.map(p=>p.startDate).sort(),ends=periods.map(p=>p.endDate).sort();
 const start=starts.length&&starts.every(rhDate)?monthLabel(starts[0]):'[mois année à préciser]';
 const end=ends.length&&ends.every(rhDate)?monthLabel(ends[ends.length-1]):'[mois année à préciser]';
 return `Par la présente ${clientName} déclare que, dans le cadre de la justification de dépenses des projets ci-dessous, les dépenses relatives à la catégorie «Ressources humaines» pour les mois de ${start} à ${end} ont été payées selon les informations détaillées dans les tableaux ci-après.`;
}
