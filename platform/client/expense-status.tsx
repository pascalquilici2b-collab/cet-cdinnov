import {Icon} from './icon';
import {expenseStatus} from './finance-domain';

/** Keep the stored workflow values; presentation is shared by both expense views. */
export function ExpenseStatus({status}:{status?:string}) {
  const label=expenseStatus(status);
  const state=label==='Payée'?'paid':label==='Envoyé'?'sent':'draft';
  return <span className={'expense-status is-'+state}>
    {state!=='draft'&&<Icon name={state==='paid'?'cash':'mail'}/>}
    {label}
  </span>;
}
