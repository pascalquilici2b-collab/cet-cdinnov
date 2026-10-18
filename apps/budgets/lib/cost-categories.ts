const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export const COST_CATEGORIES=[
 {id:"hr",label:"Ressources humaines",value:"Frais de personnel",color:"#3567a5",icon:"users"},
 {id:"office",label:"Frais de bureau et administration",value:"Bureau et administration",color:"#98703e",icon:"building"},
 {id:"travel",label:"Déplacements et hébergement",value:"Déplacement et hébergement",color:"#287b68",icon:"plane"},
 {id:"external",label:"Expertise et services externes",value:"Expertise et services externes",color:"#74578e",icon:"briefcase"},
 {id:"equipment",label:"Équipement",value:"Équipement",color:"#a24f6b",icon:"monitor"},
 {id:"works",label:"Infrastructures et travaux",value:"Infrastructures et travaux",color:"#a55d14",icon:"construction"},
 {id:"other",label:"Autres coûts",value:"Autres coûts",color:"#53677d",icon:"folder"},
] as const;
export function costCategory(value:string){
 const s=normalize(value);
 const id=/personnel|personale|staff|ressources humaines/.test(s)?"hr":/bureau|administrati|ufficio|office/.test(s)?"office":/deplacement|hebergement|viaggio|soggiorno|travel|accommodation/.test(s)?"travel":/expertise|externe|esterni|external|consulenze/.test(s)?"external":/equipement|attrezzatur|equipment/.test(s)?"equipment":/infrastruct|travaux|works|costruzion/.test(s)?"works":"other";
 return COST_CATEGORIES.find(c=>c.id===id)!;
}
export const JEMS_CATEGORY_OPTIONS=[
 "Frais de personnel","Taux forfaitaire des frais de personnel","Bureau et administration","Bureau et administration - taux forfaitaire",
 "Déplacement et hébergement","Taux forfaitaire pour les frais de déplacement et d'hébergement",
 "Expertise et services externes","Équipement","Infrastructures et travaux",
];
export function categoryOptions(current:string[]=[]){return [...new Set([...JEMS_CATEGORY_OPTIONS,...current.filter(Boolean)])]}
