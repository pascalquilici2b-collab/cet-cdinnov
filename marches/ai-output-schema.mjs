/** Structured-output candidates for evaluation. No production request imports
 * this module until the model and schema combination passes its benchmark.
 * Cloudflare binding /ai/run JSON Mode takes the JSON Schema directly in
 * response_format.json_schema (workers-ai/features/json-mode/).
 * These schemas constrain shape; source citations and business validation
 * remain mandatory and are deliberately not replaced here.
 */
const text=(description)=>({type:'string',...(description?{description}:{})});
const enumeration=(values)=>({type:'string',enum:values});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const array=(items,maxItems=150)=>({type:'array',items,maxItems});
const quote=(minLength=10,maxLength=1500,description='Extrait contigu exact du texte source prouvant la valeur, sans reformulation ni assemblage de passages.')=>({type:'string',minLength,maxLength,description});
const money=()=>({type:['number','null'],description:'Montant explicitement lisible en euros décimaux ; null si absent ou illisible. Ne pas calculer ni inventer.'});
const dateOrEmpty=()=>text('Date ISO YYYY-MM-DD explicitement établie, ou chaîne vide. Une signature ou une durée ne prouve pas une date effective.');
const fact=(fields,value)=>object({field:enumeration(fields),value,quote:quote()});
const marketFacts={anyOf:[
 fact(['title','reference','clientName'],text('Valeur explicitement présente ; clientName est l’acheteur et non le titulaire.')),
 fact(['type'],enumeration(['framework','fixed','quote','mixed','consultation','direct'])),
 fact(['billingMode'],enumeration(['actual','fixed','milestone','schedule','mixed'])),
 fact(['notificationDate','startDate'],text('Date ISO YYYY-MM-DD explicite ; notificationDate exige une réception établie.')),
 fact(['startBasis'],enumeration(['notification','first_order','date'])),
 fact(['initialDurationMonths','renewalCount'],{type:'integer',minimum:0}),
 fact(['maximumMinor','minimumMinor'],{type:'integer',minimum:0,description:'Montant HT contractuel en centimes entiers, explicitement prouvé. maximumMinor exclut les plafonds annuels et les estimations.'}),
 fact(['periodBasis'],enumeration(['unknown','notification','calendar','custom'])),
 fact(['renewalMode'],enumeration(['unknown','none','tacit','express'])),
 fact(['noMinimum','feesIncluded'],{type:'boolean'}),
]};
export const MARKET_OUTPUT_SCHEMA=object({
 facts:array(marketFacts),
 prices:array(object({label:text(),amount:money(),vatRate:{type:['number','null'],description:'Taux de TVA en pourcentage explicitement applicable à la prestation, sinon null ; ne pas supposer 20.'},grossAmount:money(),unit:enumeration(['day','hour','flat','unit','km']),profile:text(),location:text(),startDate:dateOrEmpty(),endDate:dateOrEmpty(),notes:text(),quote:quote()})),
 ceilings:array(object({label:text(),amount:money(),basis:enumeration(['HT','TTC']),scope:enumeration(['annual','contract']),consumptionBasis:enumeration(['orders','invoices']),notes:text(),quote:quote()})),
 periods:array(object({label:text(),startDate:dateOrEmpty(),endDate:dateOrEmpty(),decision:text(),quote:quote()})),
 conditions:array(object({category:enumeration(['payment','billing','orders','revision','expenses','deliverables','report','tax','other']),label:text(),value:text('Règle explicite résumée sans ajout ; conserver les clauses et échéances utiles.'),quote:quote()})),
 projects:array(object({name:text('Projet nommé distinctement, jamais une reformulation de l’objet du marché.'),code:text(),programme:text(),startDate:dateOrEmpty(),endDate:dateOrEmpty(),quote:quote(),orders:array(object({reference:text(),date:dateOrEmpty(),amount:money(),quote:quote()}),100)})),
 issues:array(object({title:text(),detail:text(),blocking:{type:'boolean'},quote:quote()})),
});
const engagementQuote=()=>quote(5,2000,'Extrait contigu EXACT du texte prouvant la valeur. Pour amountMinor, inclure le montant ET son contexte HT ou hors taxes dans la MÊME citation.');
export const ENGAGEMENT_OUTPUT_SCHEMA=object({facts:array({anyOf:[
 object({field:enumeration(['reference','date','marketReference','engagement','serviceCode','otherReference']),value:{type:'string',minLength:1,maxLength:300},quote:engagementQuote()}),
 object({field:enumeration(['amountMinor']),value:{type:'integer',minimum:0,maximum:1e14},quote:engagementQuote()}),
]},150)});
export const IDENTIFICATION_OUTPUT_SCHEMA=object({suggestions:array(object({
 field:enumeration(['employee_ref','employee_name','supplier_ref','invoice_number','document_ref','period','invoice_date']),
 value:{type:'string',maxLength:120,description:'Valeur figurant exactement dans la citation. Conserver le mois littéral ; ne déduire aucune date.'},
 quote:quote(1,220),
}),10)});
const layoutFields=['employee_ref','period','project_name','project_code','base_amount','allocation_amount','supplier_ref','invoice_number','invoice_date'];
const fixedFields=['employee_ref','period','project_name','project_code','supplier_ref','invoice_number'];
const sourceReference=()=>object({cell:text('Adresse exacte d’une cellule fournie.'),quote:quote(1,300,'Extrait exact contigu portant uniquement la valeur dans la cellule citée.')});
export const LAYOUT_OUTPUT_SCHEMA=object({plans:array(object({
 sheet:text('Identifiant exact table-N fourni dans l’entrée, jamais le nom de fichier.'),
 orientation:enumeration(['rows','columns']),header:{type:'integer',minimum:0,maximum:99},headerRows:{type:'integer',minimum:1,maximum:3},
 // Missing mappings/constants must remain absent, not null: existing source
 // validators deliberately reject null column indices and null references.
 mapping:object(Object.fromEntries(layoutFields.map(field=>[field,{type:'integer',minimum:0}])),[]),
 fixed:object(Object.fromEntries(fixedFields.map(field=>[field,sourceReference()])),[]),
 projects:array(object({source:sourceReference(),amountColumn:{type:'integer',minimum:0}}),30),
 carry:array(enumeration(['employee_ref','period','project_name']),3),
}),8)});
export const AI_OUTPUT_SCHEMAS={markets:MARKET_OUTPUT_SCHEMA,engagements:ENGAGEMENT_OUTPUT_SCHEMA,identification:IDENTIFICATION_OUTPUT_SCHEMA,layout:LAYOUT_OUTPUT_SCHEMA};
export function responseFormatFor(task){
 const schema=AI_OUTPUT_SCHEMAS[task];if(!schema)throw new Error('Unknown AI extraction task: '+task);
 return {type:'json_schema',json_schema:structuredClone(schema)};
}
/** Optional compatibility adapter for APIs requiring the OpenAI wrapper.
 * Layout uses optional dictionary members and needs ordinary JSON Schema;
 * strict OpenAI's all-properties-required subset cannot represent its current
 * contract without null cleanup, which is intentionally not introduced.
 */
export function openAIResponseFormatFor(task){
 if(task==='layout')throw new Error('Layout uses optional mapping keys; use Cloudflare direct JSON Schema.');
 const {json_schema:schema}=responseFormatFor(task);
 return {type:'json_schema',json_schema:{name:'cdinnov_'+task,strict:true,schema}};
}
