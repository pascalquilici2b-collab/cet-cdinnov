import type {BillingDocument} from './billing-contracts';
export function defaultBillingEmail(record:BillingDocument){
 const invoice=record.data.kind==='invoice',number=record.issuance?.number||record.reservedNumber?.number||'[N° de '+(invoice?'facture':'devis')+']';
 const project=record.data.references.project?.trim()||'[Nom du projet]',period=record.data.details?.period||'';
 const periodLabel=/^S[1-8]$/.test(period)?'Semestre '+period.slice(1):period||'[Numéro de période ou semestre]';
 return `Bonjour,\n\nJe vous prie de bien vouloir trouver ci-joint ${invoice?'la facture':'le devis'} ${number} ${invoice?'relative':'relatif'} au projet ${project} pour la période ${periodLabel}.\n\nVous en souhaitant bonne réception,\nConseil Développement Innovation`;
}
