export default function PendingExpensesBadge({count}:{count:number}){
  if(!count)return null;
  const label=`${count} dépense${count>1?"s":""} à affecter`;
  return <span className="pending-expenses-badge" title={label} aria-label={label}>{count}</span>;
}
