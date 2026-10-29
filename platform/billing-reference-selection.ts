import type {BillingReferences,BillingFollowupLink} from './billing-contracts';
/** Project menus include global market orders; preserve the selected commitment when it is still available. */
export function referencesForProject(r:BillingReferences,project?:{id:string;name:string;orders:{id:string}[]}):BillingReferences{
 const compatible=!r.orderId||!!project?.orders.some(o=>o.id===r.orderId);
 return {...r,projectId:project?.id||'',project:project?.name||'',...(compatible?{}:{orderId:'',orderReference:''})};
}
export function referencesFromEngagement(r:BillingReferences,link?:BillingFollowupLink|null):BillingReferences{
 if(!link)return r;
 return {...r,marketId:link.marketId,marketReference:link.marketReference,
  // A market-wide engagement does not erase the invoice's chosen project.
  ...(link.projectId?{projectId:link.projectId,project:link.project}:{}),
  ...(link.kind==='order'?{orderId:link.orderId,orderReference:link.reference}:{}),
  serviceCode:link.serviceCode??r.serviceCode,engagement:link.engagement??r.engagement,otherReference:link.otherReference??r.otherReference};
}
