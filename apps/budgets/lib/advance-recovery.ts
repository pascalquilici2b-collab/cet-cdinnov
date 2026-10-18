import {round,type Project,type RecoveryChoice,type Workspace} from "./budget-model.ts";

export function advanceRecoveryChoices(ws:Workspace,p:Project){
 const choices:Record<string,RecoveryChoice|"legacy">={},last=p.periods.at(-1)?.id;
 const amount=(p.advance.requested||p.advance.received)?round(p.eligibleBudget*p.federRate/100*p.advance.rate/100):0;
 for(const period of p.periods){
  const dr=ws.drs.find(d=>d.projectId===p.id&&d.periodId===period.id);
  if(dr?.recoveryChoice){choices[period.id]=dr.recoveryChoice;continue}
  if(dr?.recoveryOverride||dr?.recovery){choices[period.id]=dr.recovery?"legacy":"none";continue}
  if(period.id!==last)choices[period.id]=amount&&period.id===p.advance.recoveryPeriod?"first":"none";
 }
 if(last&&!choices[last])choices[last]=Object.values(choices).some(c=>c==="first"||c==="legacy")?"balance":"full";
 // A full settlement always excludes any earlier deduction, even after a data import.
 if(last&&choices[last]==="full")for(const period of p.periods)if(period.id!==last)choices[period.id]="none";
 return choices;
}

export function setAdvanceRecovery(ws:Workspace,p:Project,periodId:string,choice:RecoveryChoice):Workspace{
 const last=p.periods.at(-1)?.id;
 if(!p.periods.some(x=>x.id===periodId)||!(periodId===last?["balance","full"]:["none","first"]).includes(choice))throw new Error("Choix de reprise invalide pour cette période.");
 const choices=advanceRecoveryChoices(ws,p);
 if(choice==="full"||choice==="first")for(const period of p.periods)if(period.id!==last)choices[period.id]="none";
 choices[periodId]=choice;
 if(choice==="first"&&last)choices[last]="balance";
 const drs=[...ws.drs];
 for(const period of p.periods){
  const mode=choices[period.id];if(mode==="legacy")continue;
  const index=drs.findIndex(d=>d.projectId===p.id&&d.periodId===period.id),old=index>=0?drs[index]:{id:`recovery-${p.id}-${period.id}`,projectId:p.id,periodId:period.id,recovery:0};
  const next={...old,recovery:0,recoveryOverride:false,recoveryChoice:mode};
  if(index>=0)drs[index]=next;else drs.push(next);
 }
 return {...ws,demo:false,drs};
}
