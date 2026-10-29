import type {BillingReferences,BillingFollowupLink} from './billing-contracts';
/** Project menus include global market orders; preserve the selected commitment when it is still available. */
export function referencesForProject(r:BillingReferences,project?:{id:string;name:string;orders:{id:string}[]}):BillingReferences{
 const compatible=!r.orderId||!!project?.orders.some(o=>o.id===r.orderId);
 return {...r,projectId:project?.id||'',project:project?.name||'',...(compatible?{}:{orderId:'',orderReference:'',serviceCode:'',engagement:'',otherReference:''})};
}
export function referencesFromEngagement(r:BillingReferences,link?:BillingFollowupLink|null,projectCompatible=r.marketId===link?.marketId):BillingReferences{
 if(!link)return r;
 return {...r,marketId:link.marketId,marketReference:link.marketReference,
  // A market-wide engagement does not erase the invoice's chosen project.
  ...(link.projectId?{projectId:link.projectId,project:link.project}:projectCompatible?{}:{projectId:'',project:''}),
  ...(link.kind==='order'?{orderId:link.orderId,orderReference:link.reference}:{orderId:'',orderReference:''}),
  serviceCode:link.serviceCode??'',engagement:link.engagement??'',otherReference:link.otherReference??''};
}
