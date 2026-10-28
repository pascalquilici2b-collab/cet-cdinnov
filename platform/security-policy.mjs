import {readFile,writeFile} from 'node:fs/promises';

// Classic portal handlers still need inline scripts. No string evaluation or
// third-party executable CDN is allowed. WebAssembly is used by local PDF/OCR.
export const contentSecurityPolicy=[
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' blob: data: https://cet-data.pascalquilici2b.workers.dev https://cdinnov-facturx.onrender.com https://login.microsoftonline.com https://graph.microsoft.com https://nominatim.openstreetmap.org https://router.project-osrm.org https://api-adresse.data.gouv.fr https://photon.komoot.io https://recherche-entreprises.api.gouv.fr",
  "worker-src 'self' blob:",
  "frame-src 'self' blob: data: https://login.microsoftonline.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://login.microsoftonline.com",
].join('; ');

export function secureHtml(html,profile='portal'){
  // Meta delivery works on GitHub Pages. frame-ancestors/HSTS require actual
  // response headers and must not be represented as fixed by these tags.
  html=html.replace(/<meta\b[^>]*(?:http-equiv=["']Content-Security-Policy["']|name=["']referrer["'])[^>]*>/gi,'');
  html=html.replace(/<style id="cdi-frame-guard">[\s\S]*?<\/style>\s*<script src="\/platform\/frame-guard\.js"><\/script>/g,'');
  const charset=html.match(/<meta\b[^>]*charset=[^>]+>/i)?.[0]||'<meta charset="utf-8">';
  html=html.replace(/<meta\b[^>]*charset=[^>]+>/gi,'');
  html=html.replace(/^[\t ]+$/gm,'').replace(/(<head>)[\r\n\t ]*/i,'$1');
  let policy=contentSecurityPolicy;
  if(profile!=='portal')policy=policy.replace("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'","script-src 'self'");
  if(profile==='sheets'||profile==='budgets')policy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://cet-data.pascalquilici2b.workers.dev; object-src 'none'; base-uri 'self'; form-action 'self'";
  return html.replace(/<head>/i,`<head>\n${charset}\n<meta http-equiv="Content-Security-Policy" content="${policy}">\n<meta name="referrer" content="no-referrer">\n<style id="cdi-frame-guard">html{visibility:hidden}</style><script src="/platform/frame-guard.js"></script>`);
}
export async function secureHtmlFile(file,profile='portal'){await writeFile(file,secureHtml(await readFile(file,'utf8'),profile));}
