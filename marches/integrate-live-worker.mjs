import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// Accept a freshly downloaded, unmodified production entry. This deliberately
// fails if the routing anchors change, rather than replacing a newer service.
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage : node integrate-live-worker.mjs <entry-actif.mjs> <dossier-sortie>');
if(path.resolve(input)===path.resolve(output,'entry.mjs'))throw new Error('Conserver le fichier source séparément.');
const require=createRequire(process.env.MARCHES_BUILD_PACKAGE||'C:/Users/quili/OneDrive - cdinnov.com/CDInnov - Pascal QUILICI/40 - CDINNOV GESTION INTERNE/CET & CONGES PAYES/LOGICIEL CET/agenda/package.json');
const {build}=require('esbuild');
const before=await readFile(input,'utf8');
const route='if (!["/budgets/session", "/budgets/workspace", "/budgets/clients", "/budgets/agenda"].includes(path) && !path.startsWith("/budgets/agenda/"))';
const replacement='if (!["/budgets/session", "/budgets/workspace", "/budgets/clients", "/budgets/agenda", "/budgets/markets"].includes(path) && !path.startsWith("/budgets/agenda/") && !path.startsWith("/budgets/markets/"))';
const anchor='      if (path === "/budgets/agenda" || path.startsWith("/budgets/agenda/"))';
const dispatch='      if (path === "/budgets/markets" || path.startsWith("/budgets/markets/")) return await handleMarkets(request, db, email, admins.includes(email), reply, jsonBody);\n';
assert.equal(before.split(route).length,2,'Routage actif inconnu');
assert.equal(before.split(anchor).length,2,'Point de délégation actif inconnu');
assert.ok(!before.includes('handleMarkets'),'Module déjà intégré');
const imports='import { handleMarkets } from "./markets-service.mjs";\n';
const after=imports+before.replace(route,replacement).replace(anchor,dispatch+anchor);
assert.equal(after.slice(imports.length).replace(replacement,route).replace(dispatch,''),before);
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'entry.mjs'),after);
await build({entryPoints:[fileURLToPath(new URL('worker.mjs',import.meta.url))],bundle:true,platform:'node',format:'esm',outfile:path.join(output,'markets-service.mjs')});
await build({entryPoints:[path.join(output,'entry.mjs')],bundle:true,platform:'node',format:'esm',outfile:path.join(output,'combined-test.mjs')});
console.log('Worker actif conservé hors un import et deux ajouts de routage. Aucun déploiement effectué.');
