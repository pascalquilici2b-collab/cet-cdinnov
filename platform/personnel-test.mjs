import assert from 'node:assert/strict';
import {filterMovements} from './client/personnel-domain.ts';
const source=[{id:'past',annee:2025,matricule:'004',date:'2025-01-01',libelle:'Crédit',categorie:'Alimentation',qteSignee:6,montant:1200,type:'CP'},
 {id:'a',annee:2026,matricule:'004',date:'2026-02-01',libelle:'Congés',categorie:'Alimentation',qteSignee:3,montant:600,type:'CP',sal:{nom:'Exemple',prenom:'Alex'},commentaire:'Crédit de test'},
 {id:'b',annee:2026,matricule:'001',date:'2026-03-01',libelle:'PEE',categorie:'Utilisation',qteSignee:-1,montant:null,type:'UTIL_PEI',sal:{nom:'Direction',prenom:'Camille'}},
 {id:'c',annee:2026,matricule:'004',date:'2026-04-01',libelle:'PEE',categorie:'Utilisation',qteSignee:-2,montant:-400,type:'UTIL_PEI',sal:{nom:'Exemple',prenom:'Alex'}}];
const before=JSON.stringify(source),filter={sal:'',type:'',cat:'',q:''};
const ids=(access='admin',patch={},sort={key:'date',dir:'desc'})=>filterMovements(source,2026,access,{...filter,...patch},sort).map(m=>m.id);
assert.deepEqual(ids(),['c','b','a']);assert.deepEqual(ids('004'),['c','a']);assert.deepEqual(ids(null),[]);assert.deepEqual(ids('admin',{q:'exemple crédit'}),[]);assert.deepEqual(ids('admin',{q:'CRÉDIT'}),['a']);
assert.deepEqual(ids('admin',{sal:'004',cat:'Utilisation'}),['c']);assert.deepEqual(ids('admin',{type:'CP'}),['a']);assert.deepEqual(ids('004',{sal:'001'}),['c','a']);
assert.deepEqual(ids('admin',{}, {key:'montant',dir:'asc'}),['b','c','a']);assert.deepEqual(ids('admin',{}, {key:'qte',dir:'desc'}),['a','b','c']);assert.equal(JSON.stringify(source),before);
console.log('Personnel selectors passed: year, text, category, type, numeric sorting, employee scope and immutable input.');
