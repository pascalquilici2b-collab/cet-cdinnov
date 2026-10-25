import {useState} from 'react';
import {Dialog} from 'radix-ui';
import {Check,ShieldCheck,SlidersHorizontal,X,LoaderCircle,Info} from 'lucide-react';
import {accessModules,accountAccess} from '../access';
import type {ModuleAccess} from '../access';
import type {AccountSummary} from './personnel-domain';
import './action-dialog.css';
import './account-access.css';

export function AccountAccess({account,save}:{account:AccountSummary;save:(access:ModuleAccess)=>Promise<void>}){
 const [open,setOpen]=useState(false),[value,setValue]=useState(()=>accountAccess(account.access,account.admin)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Dialog.Root open={open} onOpenChange={next=>{if(busy)return;if(next){setValue(accountAccess(account.access,account.admin));setError('');}setOpen(next);}}>
  <Dialog.Trigger asChild><button className="btn btn-ghost btn-sm account-access-trigger" type="button" aria-label={'Accès de '+(account.name||account.email)}><SlidersHorizontal size={15}/>{account.admin?'Tous les accès':'Accès'}</button></Dialog.Trigger>
  <Dialog.Portal><Dialog.Overlay className="cdi-dialog-overlay"/><Dialog.Content className="cdi-dialog account-access-dialog">
   <header><div><Dialog.Title>Accès de {account.name||account.email}</Dialog.Title><Dialog.Description>{account.name?account.email:'Pilotage et applications'}</Dialog.Description></div><Dialog.Close asChild><button type="button" aria-label="Fermer" disabled={busy}><X size={19}/></button></Dialog.Close></header>
   {account.admin?<p className="account-access-admin"><ShieldCheck size={18}/> Tous les accès sont inclus pour les administrateurs.</p>:<span className="account-access-info" title="L’accès aux rubriques conserve les règles de confidentialité des dossiers salariés. Les fonctions d’administration restent réservées aux administrateurs." tabIndex={0}><Info size={15}/> Droits par rubrique</span>}
   <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await save(value);setOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <div className="account-access-groups">{['Pilotage','Applications'].map(group=><fieldset key={group} disabled={busy||account.admin}><legend>{group}</legend>{accessModules.filter(m=>m.group===group).map(m=><label key={m.key}><span>{m.label}</span><input type="checkbox" role="switch" aria-label={m.label} checked={value[m.key]} onChange={e=>setValue({...value,[m.key]:e.target.checked})}/><span className="account-access-switch" aria-hidden="true"><Check size={11}/></span></label>)}</fieldset>)}</div>
    {error&&<p className="account-access-error" role="alert">{error}</p>}
    <div className="cdi-dialog-actions"><Dialog.Close asChild><button type="button" disabled={busy}>{account.admin?'Fermer':'Annuler'}</button></Dialog.Close>{!account.admin&&<button className="is-primary" type="submit" disabled={busy}>{busy&&<LoaderCircle size={16}/>}Enregistrer les accès</button>}</div>
   </form>
  </Dialog.Content></Dialog.Portal>
 </Dialog.Root>;
}
