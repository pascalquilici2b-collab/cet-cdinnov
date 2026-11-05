import React from 'react';

export function rhInitials(name:string){return name.trim().split(/[\s-]+/).filter(Boolean).slice(0,3).map(part=>part[0]).join('').toLocaleUpperCase('fr-FR')||'?';}
export function RhAvatar({name,small=false}:{name:string;small?:boolean}){
 let hash=0;for(const letter of name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())hash=(hash*31+letter.charCodeAt(0))>>>0;
 const colors=[['#ede8fb','#6653a2'],['#e4effb','#285d9a'],['#e2f0e9','#2c7051'],['#f8e7ec','#9e4261'],['#fbecdf','#98592a'],['#e1eff0','#286970']];
 const [background,color]=colors[hash%colors.length];
 return <span className={'rh-person-avatar'+(small?' rh-person-avatar-small':'')} style={{background,color}} aria-hidden="true">{rhInitials(name)}</span>;
}
