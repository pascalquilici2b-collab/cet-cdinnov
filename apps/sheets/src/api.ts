import type { Session } from "./contracts";
import '../../../platform/client/session-ui.js';
export const isCloud = true;
export const apiBase = "";
export const sessionKey = "cet_auth_session";
export function readSession(): Session | null {
  return window.CDISession.read();
}
export function expireSession(sessionId?: string) {
  window.CDISession.expire({sessionId});
}
let signingOut = false, loginAttempt = 0, pendingLogin: Promise<Session> | null = null;
export async function signOut() {
  if (signingOut) return;
  signingOut = true; loginAttempt++;
  window.CDISession.logout();
  try {
    await pendingLogin?.catch(() => {});
    await fetch('/api/v1/session', {method:'DELETE', credentials:'same-origin', headers:{'X-CDInnov-Request':'1'}, signal:AbortSignal.timeout(10000)});
  } finally { signingOut = false; }
}
export async function requestState(
  options: RequestInit = {},
  owner?: string,
): Promise<Response> {
  const session = readSession();
  if (session && owner && session.email !== owner) {
    throw new Error('La session a changé. Reconnectez-vous pour continuer.');
  }
  if (!session) {
    expireSession();
    throw new Error(
      "Reconnectez-vous à votre compte CDInnov pour enregistrer.",
    );
  }
  const headers = new Headers(options.headers);
  headers.delete("Authorization");
  if (!['GET','HEAD','OPTIONS'].includes((options.method || 'GET').toUpperCase())) headers.set('X-CDInnov-Request','1');
  const response = await fetch(apiBase + "/sheets/state", {
    ...options,
    credentials: 'same-origin',
    cache: "no-store",
    signal: options.signal || AbortSignal.timeout(30000),
    headers,
  });
  const body = await response.arrayBuffer();
  if (readSession()?.sessionId !== session.sessionId)
    throw new Error("La session a changé. Reconnectez-vous pour continuer.");
  if (response.status === 401) expireSession(session.sessionId);
  return new Response([204,304].includes(response.status) ? null : body, {status:response.status, statusText:response.statusText, headers:response.headers});
}
export const hexToBytes = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(text.match(/.{2}/g) || [], (part) => parseInt(part, 16));
export const bytesToHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
export async function signIn(
  email: string,
  password: string,
  commit = true,
  application: 'sheets' | 'budgets' = 'sheets',
): Promise<Session> {
  if (signingOut || pendingLogin) throw new Error('Une connexion est déjà en cours. Réessayez dans un instant.');
  const attempt = ++loginAttempt;
  const pending = (async () => {
  email = email.trim().toLowerCase();
  const exchange = async (payload: Record<string, unknown>) => {
    const response = await fetch(apiBase + "/budgets/session", {
      method: "POST",
      credentials: 'same-origin',
      headers: { "Content-Type": "application/json", 'X-CDInnov-Request':'1' },
      body: JSON.stringify({ email, ...payload }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Connexion impossible.");
    return result;
  };
  const challenge = await exchange({ action: "challenge" });
  if (
    !/^[a-f0-9]{32}$/i.test(challenge.salt) ||
    !Number.isInteger(challenge.iter) ||
    challenge.iter < 100000 ||
    challenge.iter > 1000000 ||
    typeof challenge.challenge !== "string"
  )
    throw new Error("Service de connexion indisponible.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(challenge.salt),
      iterations: challenge.iter,
      hash: "SHA-256",
    },
    material,
    256,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    bits,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const proof = bytesToHex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(challenge.challenge),
    ),
  );
  if (attempt !== loginAttempt || signingOut) throw new Error('La demande de connexion a changé.');
  const result = await exchange({
      action: "verify",
      challenge: challenge.challenge,
      proof,
    });
  if (attempt !== loginAttempt || signingOut) {
    await fetch('/api/v1/session', {method:'DELETE',credentials:'same-origin',headers:{'X-CDInnov-Request':'1'}}).catch(() => {});
    throw new Error('La demande de connexion a changé.');
  }
  const session: Session = {email, expiresAt:result.expiresAt, sessionId:result.sessionId};
  // The cookie already changed: retire the former account even if this new
  // account is subsequently denied access to the requested application.
  if (window.CDISession.current()?.email !== email && window.CDISession.current()) window.CDISession.accept(session);
  await verifySession(application);
  if (attempt !== loginAttempt || signingOut) throw new Error('La demande de connexion a changé.');
  if (commit) window.CDISession.accept(session);
  return session;
  })();
  pendingLogin = pending;
  try { return await pending; } finally { if (pendingLogin === pending) pendingLogin = null; }
}
export async function verifySession(application: 'sheets' | 'budgets' = 'sheets'): Promise<void> {
  const response = await fetch(apiBase + (application === 'sheets' ? '/sheets/session' : '/api/v1/session'), {credentials:'same-origin', cache:'no-store',signal:AbortSignal.timeout(30000)});
  if (response.ok && application === 'budgets') {const identity = await response.json(); if (!identity.admin && identity.access?.budgetsprojets !== true) throw Object.assign(new Error('Votre compte n’a pas accès aux budgets projets.'), {status:403});}
  if (!response.ok) throw Object.assign(new Error(response.status === 403 ? 'Votre compte n’a pas accès à CDInnovSheets.' : response.status === 401 ? 'Reconnectez-vous avec votre compte CDInnov.' : 'Le service est indisponible. Réessayez dans un instant.'), {status:response.status});
}
