import type {BillingDocument} from './billing-contracts';
import {documentPeriods,periodLabel} from './billing-periods.ts';
export function defaultBillingEmail(record:BillingDocument){
 const invoice=record.data.kind==='invoice',number=record.issuance?.number||record.reservedNumber?.number||'[N° de '+(invoice?'facture':'devis')+']';
 const project=record.data.references.project?.trim()||'[Nom du projet]',label=periodLabel(record.data.details)||'[Numéro de période ou semestre]';
 return `Bonjour,\n\nJe vous prie de bien vouloir trouver ci-joint ${invoice?'la facture':'le devis'} ${number} ${invoice?'relative':'relatif'} au projet ${project} pour ${documentPeriods(record.data.details).length>1?'les périodes':'la période'} ${label}.${invoice?'\n\nLa facture électronique vous sera également adressée sur votre plateforme agréée.':''}\n\nVous en souhaitant bonne réception,\nConseil Développement Innovation`;
}
