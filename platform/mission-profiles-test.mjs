import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MISSION_PROFILES,missionTasksForProfile} from './mission-profiles.ts';

test('Explicit project functions cover the observed operational and support roles',()=>{
 assert.equal(new Set(MISSION_PROFILES.map(p=>p.id)).size,MISSION_PROFILES.length);
 for(const id of ['chef-projet','responsable-technique','responsable-administratif','responsable-administratif-financier','assistance-administrative','communication','charge-mission'])assert.ok(MISSION_PROFILES.some(p=>p.id===id));
 assert.equal(missionTasksForProfile('Directeur régional'),'');
 assert.equal(missionTasksForProfile(''),'');
 assert.equal(missionTasksForProfile('legacy-profile'),'');
});

test('Project interpolation is optional, plain text and does not change the catalogue',()=>{
 const before=JSON.stringify(MISSION_PROFILES),plain=missionTasksForProfile('communication');
 assert.ok(plain.includes('du projet'));assert.ok(!plain.includes('undefined'));
 const personalized=missionTasksForProfile('communication','  Projet\nFictif $& <test>  ');
 assert.ok(personalized.includes('du projet « Projet Fictif $& <test> »'));
 assert.equal(personalized.split('\n').length,plain.split('\n').length);
 assert.equal(missionTasksForProfile('communication','  '),plain);
 assert.equal(JSON.stringify(MISSION_PROFILES),before);
});

test('Suggestions contain complete generic tasks without source paths or personal records',()=>{
 for(const profile of MISSION_PROFILES){
  assert.ok(profile.tasks.length>=3);assert.ok(profile.tasks.every(task=>task.endsWith('.')&&!task.includes('\n')));
  const text=missionTasksForProfile(profile.id);assert.doesNotMatch(text,/C:\\|OneDrive|\.docx|\.pdf|@|\b\d{14}\b|À COMPLÉTER/);
 }
});
