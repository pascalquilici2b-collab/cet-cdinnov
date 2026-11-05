import type {Environment} from './contracts';

export function responseHeaders(request: Request, env: Environment): Headers {
  const headers = new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Strict-Transport-Security':'max-age=31536000','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
  const origin = request.headers.get('origin');
  const allowed = (env.BUDGETS_ALLOWED_ORIGINS || 'https://app.cdinnov.eu').split(',').map(x => x.trim());
  if (origin && !allowed.includes(origin)) throw Object.assign(new Error('Origine non autorisée.'), {status:403});
  // Browsers authenticate with a host-only HttpOnly cookie. CORS alone does not
  // stop a cross-site form from submitting a state-changing request.
  if(request.headers.get('sec-fetch-site')==='cross-site')throw Object.assign(new Error('Origine non autorisée.'),{status:403});
  if(!['GET','HEAD','OPTIONS'].includes(request.method)&&(!origin||!allowed.includes(origin)||request.headers.get('x-cdinnov-request')!=='1')){
    throw Object.assign(new Error('Requête non autorisée. Rechargez l’application.'),{status:403});
  }
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods','GET, PUT, PATCH, POST, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers','Content-Type, If-Match, If-None-Match, X-Filename, X-CDInnov-Request');
    headers.set('Access-Control-Expose-Headers','ETag');
  }
  return headers;
}
