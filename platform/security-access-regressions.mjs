import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Reuse existing API scenarios against current sources, without rebuilding or
// replacing the deployed .build/entry.mjs artifact.
for(const name of ['portal-test.mjs','account-roles-test.mjs']){
  const source=(await readFile(new URL(name,import.meta.url),'utf8')).replace(/^process\.env\.MARCHES_TEST_WORKER=.*$/m,'delete process.env.MARCHES_TEST_WORKER;').replace(/from\s+(['"])(\.[^'"]+)\1/g,(_match,quote,path)=>'from '+quote+new URL(path,import.meta.url).href+quote);
  console.log('Current-source regression: '+name);
  const generated=new URL('security-access-generated-'+name,import.meta.url);
  await writeFile(generated,source);
  let run;
  try {run=spawnSync(process.execPath,[fileURLToPath(generated)],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',env:process.env,timeout:60000});}
  finally {await unlink(generated);}
  if(run.error)throw run.error;
  if(run.status!==0)process.exit(run.status||1);
}
