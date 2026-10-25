/** Module access is independent of administrator powers and employee ownership. */
export const accessModules = [
 {key:'dashboard',label:'Tableau de bord',group:'Pilotage',default:true},
 {key:'mouvements',label:'Mouvements CET',group:'Pilotage',default:true},
 {key:'salaries',label:'Salariés',group:'Pilotage',default:false},
 {key:'notesfrais',label:'Notes de frais',group:'Pilotage',default:true},
 {key:'agenda',label:'Congés et déplacements',group:'Pilotage',default:true},
 {key:'tamponnage',label:'Tamponnage des pièces',group:'Applications',default:false},
 {key:'facturier',label:'Logiciel de facturation',group:'Applications',default:false},
 {key:'budgetsprojets',label:'Outil budgets',group:'Applications',default:true},
 {key:'sheets',label:'CDInnovSheets',group:'Applications',default:true},
] as const;
export type AccessKey = typeof accessModules[number]['key'];
export type ModuleAccess = Record<AccessKey,boolean>;
export function accountAccess(value:unknown,admin=false):ModuleAccess {
 const data=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 return Object.fromEntries(accessModules.map(m=>[m.key,admin|| (typeof data[m.key]==='boolean'?data[m.key]:m.default)])) as ModuleAccess;
}
export function hasAccess(account:{admin:boolean;access?:unknown},key:AccessKey):boolean {
 return account.admin||accountAccess(account.access)[key];
}
export function validAccess(value:unknown):value is ModuleAccess {
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===accessModules.length&&accessModules.every(m=>typeof (value as ModuleAccess)[m.key]==='boolean');
}
