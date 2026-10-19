import type {Environment} from './contracts';

export function responseHeaders(request: Request, env: Environment): Headers {
  const headers = new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'Vary':'Origin','X-Content-Type-Options':'nosniff'});
  const origin = request.headers.get('origin');
  const allowed = (env.BUDGETS_ALLOWED_ORIGINS || 'https://app.cdinnov.eu').split(',').map(x => x.trim());
  if (origin && !allowed.includes(origin)) throw Object.assign(new Error('Origine non autorisée.'), {status:403});
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods','GET, PUT, PATCH, POST, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers','Content-Type, Authorization, If-Match, If-None-Match');
    headers.set('Access-Control-Expose-Headers','ETag');
  }
  return headers;
}
