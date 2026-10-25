import {UsersRound,Package,ArrowUpRight} from 'lucide-react';
export type StampCategory='RH'|'SERVICES';
export const stampCategoryLabels={RH:'Ressources humaines',SERVICES:'Prestations de services & équipements'};
export function StampCategories({batches,onSelect}:{batches:any[];onSelect:(v:StampCategory)=>void}){
 return <nav className="stamp-categories" aria-label="Types de pièces">{(['RH','SERVICES'] as const).map(category=>{const Icon=category==='RH'?UsersRound:Package,count=batches.filter(b=>b.category===category||b.category==='MIXED').length;return <button key={category} className={'stamp-category '+category.toLowerCase()} onClick={()=>onSelect(category)}><span className="stamp-category-icon"><Icon size={29}/></span><strong>{stampCategoryLabels[category]}</strong><span className="stamp-category-count">{count} lot{count===1?'':'s'}</span><ArrowUpRight size={21} className="stamp-category-arrow"/></button>;})}</nav>;
}
