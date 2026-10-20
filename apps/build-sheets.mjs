import {build} from 'vite';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
await build({configFile:fileURLToPath(new URL('./sheets/vite.config.mjs',import.meta.url))});
const output=new URL('../feuilles/index.html',import.meta.url);
let html=await readFile(output,'utf8');
html=html.replace('</head>','<link rel="stylesheet" href="/feuilles/navigation.css?v=apple1">\n<link rel="stylesheet" href="/design/sheets.css?v=apple1">\n<link rel="stylesheet" href="/design/apple.css?v=apple1">\n<link rel="stylesheet" href="/design/interactions.css?v=apple-motion-20261020">\n</head>');
await writeFile(output,html);
console.log('Smartsheet built entirely from recovered React/TypeScript sources.');
