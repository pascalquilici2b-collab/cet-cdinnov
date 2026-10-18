import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root = new URL('../', import.meta.url);
const require = createRequire(process.env.MARCHES_BUILD_PACKAGE || new URL('../package.json', import.meta.url));
const {build} = require('esbuild');
const js = (await build({entryPoints:[fileURLToPath(new URL('leave-periods.mjs', import.meta.url))],
  bundle:true, format:'iife', globalName:'CDILeavePeriods', platform:'browser', write:false})).outputFiles[0].text;
const file = new URL('index.html', root);
let html = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
const block = '/* CDI_LEAVE_PERIODS_START */\n' + js + '/* CDI_LEAVE_PERIODS_END */';
if (html.includes('/* CDI_LEAVE_PERIODS_START */')) html = html.replace(/\/\* CDI_LEAVE_PERIODS_START \*\/[\s\S]*?\/\* CDI_LEAVE_PERIODS_END \*\//, () => block);
else {
  if (!html.includes('function agendaLeaves(){')) throw new Error('Leave integration point not found');
  html = html.replace('function agendaLeaves(){', block + '\nfunction agendaLeaves(){');
}
await writeFile(file, html);
console.log('Continuous leave periods integrated.');
