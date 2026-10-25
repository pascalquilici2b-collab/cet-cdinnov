import type { Session } from "./contracts";
export const isCloud = true;
export const apiBase = "https://cet-data.pascalquilici2b.workers.dev";
export const sessionKey = "cet_auth_session";
export function readSession(): Session | null {
  try {
    const stored = JSON.parse(localStorage.getItem(sessionKey) || "null"),
      session = stored?.budgets;
    return stored &&
      Date.now() - stored.t < 8 * 3600000 &&
      session?.email === stored.email &&
      session.expiresAt > Date.now() + 1000 &&
      typeof session.token === "string"
      ? session
      : null;
  } catch {
    return null;
  }
}
export function expireSession() {
  window.dispatchEvent(new Event("cdinnov-session-expired"));
}
export function signOut() {
  localStorage.removeItem(sessionKey);
  expireSession();
}
export async function requestState(
  options: RequestInit = {},
  owner?: string,
): Promise<Response> {
  const session = readSession();
  if (!session || (owner && session.email !== owner)) {
    expireSession();
    throw new Error(
      "Reconnectez-vous à votre compte CDInnov pour enregistrer.",
    );
  }
  const headers = new Headers(options.headers);
  headers.set("Authorization", "Bearer " + session.token);
  const response = await fetch(apiBase + "/sheets/state", {
    ...options,
    cache: "no-store",
    signal: options.signal || AbortSignal.timeout(30000),
    headers,
  });
  if (response.status === 401 || response.status === 403) expireSession();
  if (readSession()?.email !== session.email)
    throw new Error("La session a changé. Reconnectez-vous pour continuer.");
  return response;
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
): Promise<Session> {
  email = email.trim().toLowerCase();
  const exchange = async (payload: Record<string, unknown>) => {
    const response = await fetch(apiBase + "/budgets/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  const session: Session = {
    ...(await exchange({
      action: "verify",
      challenge: challenge.challenge,
      proof,
    })),
    email,
  };
  localStorage.setItem(
    sessionKey,
    JSON.stringify({ email, t: Date.now(), budgets: session }),
  );
  const access=await fetch(apiBase+'/sheets/session',{headers:{Authorization:'Bearer '+session.token},cache:'no-store'});
  if(!access.ok)throw new Error(access.status===403?'Votre compte n’a pas accès à CDInnovSheets.':'Impossible de vérifier votre accès. Réessayez.');
  return session;
}
