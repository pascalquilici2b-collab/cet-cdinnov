// Synthetic records only; no production documents or account credentials.
export const shiftDay=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function dashboardFixture(accounts,today){
 const monday=shiftDay(today,-((new Date(today+'T12:00:00Z').getUTCDay()+6)%7));
 const leave=(matricule,dates,statut='Validé')=>dates.flatMap(date=>['AM','PM'].map(half=>({id:matricule+date+half,matricule,date,half,type:'Congés payés',statut})));
 return {auth:{accounts,allowed:Object.keys(accounts)},majAt:today+'T08:00:00Z',salaries:[
  {matricule:'001',prenom:'Camille',nom:'Direction',statut:'Actif',brutAnnuel:85000,photo:'PRIVATE_PHOTO',payslip:'PRIVATE_PAYSLIP'},
  {matricule:'004',prenom:'Alex',nom:'Consultant',statut:'Actif'},
  {matricule:'005',prenom:'Robin',nom:'Projet',statut:'Actif'}],
  conges:[...leave('001',[monday,shiftDay(monday,1)]),...leave('004',[shiftDay(monday,2),shiftDay(monday,3)],'En attente'),...leave('005',[monday],'Refusé')],
  factures:[{id:'invoice-1',number:'F-2026-001',client:'Client fictif',dateFacture:shiftDay(today,-10),createdAt:today+'T08:00:00Z',ht:1900,ttc:2280,pdfSource:'PRIVATE_DOCUMENT'},
    {id:'invoice-2',number:'F-2026-002',client:'Autre client fictif',dateFacture:shiftDay(today,-1),ht:3200,ttc:3840,datePaiement:today}],
  notesFrais:[{id:'expense-1',numero:12,matricule:'004',objet:'Réunion de projet',dateNote:today,statut:'Envoyé',lignes:[{montant:34.20,justificatif:'PRIVATE_RECEIPT'},{montant:18.10}],signature:'PRIVATE_SIGNATURE'},
    {id:'expense-2',numero:11,matricule:'001',objet:'Déplacement direction',dateNote:shiftDay(today,-2),statut:'Payée',lignes:[{montant:127.80}]}]
 };
}
export async function insertDashboardTrips(db,today,owner,other){
 await db.prepare(`INSERT INTO agenda_trips(id,owner,payload,version,updated_at) VALUES(?,?,?,1,?)`).bind('trip-test',owner,JSON.stringify({title:'Comité de pilotage',location:'Bastia',start:today,end:shiftDay(today,1),participants:[owner,other],notes:'PRIVATE_TRIP_NOTES',owner}),today).run();
}
