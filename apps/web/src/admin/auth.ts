// the browser half of the Cognito sign-in: authorization code with PKCE against the hosted pages.
// Small enough to write by hand, and nothing here is a secret — the client id and the domain are
// public, and the verifier never leaves this tab.

export interface AdminConfig {
  apiBaseUrl: string;
  // the Cognito hosted pages, e.g. https://latentdata-admin-prod.auth.us-east-1.amazoncognito.com
  authDomain: string;
  clientId: string;
}

type Env = Record<string, unknown>;

function setting(env: Env, name: string): string | null {
  const value = env[name];
  return typeof value === 'string' && value !== '' ? value.replace(/\/$/, '') : null;
}

// null when the build was made without the three values, which is every build but mine
export function adminConfig(env: Env = import.meta.env): AdminConfig | null {
  const apiBaseUrl = setting(env, 'VITE_API_BASE_URL');
  const authDomain = setting(env, 'VITE_COGNITO_DOMAIN');
  const clientId = setting(env, 'VITE_COGNITO_CLIENT_ID');
  if (apiBaseUrl === null || authDomain === null || clientId === null) return null;
  return { apiBaseUrl, authDomain, clientId };
}

export const ADMIN_TOKEN_KEY = 'cert-tracker:admin-token:v1';
const PENDING_KEY = 'cert-tracker:admin-signin:v1';
const SCOPE = 'openid email';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

// the site root: it is the one URL registered with Cognito, and the app routes on the hash
export function redirectUri(origin: string = window.location.origin): string {
  return `${origin}/`;
}

export interface AuthorizeRequest {
  state: string;
  challenge: string;
  redirectUri: string;
}

export function authorizeUrl(config: AdminConfig, request: AuthorizeRequest): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: request.redirectUri,
    scope: SCOPE,
    state: request.state,
    code_challenge: request.challenge,
    code_challenge_method: 'S256',
  });
  return `${config.authDomain}/oauth2/authorize?${query.toString()}`;
}

// ends the hosted pages' own session cookie; without it the next sign-in skips the password
export function signOutUrl(config: AdminConfig, logoutUri: string): string {
  const query = new URLSearchParams({ client_id: config.clientId, logout_uri: logoutUri });
  return `${config.authDomain}/logout?${query.toString()}`;
}

// reads exp out of the token without verifying it. That is fine here: this only decides when
// the UI stops showing the Review tab, and the API verifies the signature on every call.
export function tokenExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (payload === undefined) return null;
  try {
    const claims: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = (claims as { exp?: unknown } | null)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isLive(token: string, now: number = Date.now()): boolean {
  const expiry = tokenExpiry(token);
  return expiry !== null && expiry > now;
}

export interface CodeExchange {
  code: string;
  verifier: string;
  redirectUri: string;
}

// returns the ID token and deliberately drops the refresh token that comes with it: nothing
// long-lived is kept in the browser, and a session that runs out goes back through the hosted
// pages instead
export async function exchangeCode(
  config: AdminConfig,
  exchange: CodeExchange,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(`${config.authDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: exchange.code,
      redirect_uri: exchange.redirectUri,
      code_verifier: exchange.verifier,
    }),
  });
  if (!response.ok) throw new Error(`token endpoint answered ${String(response.status)}`);
  const body = (await response.json()) as { id_token?: unknown };
  if (typeof body.id_token !== 'string' || !isLive(body.id_token)) {
    throw new Error('token endpoint returned no usable ID token');
  }
  return body.id_token;
}

// sessionStorage on purpose: a shared machine shouldn't stay in admin mode after the tab closes
export function readToken(): string | null {
  try {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    return token !== null && isLive(token) ? token : null;
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token === null) sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    else sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // admin mode then only lasts for this page load
  }
}

export interface PendingSignIn {
  state: string;
  verifier: string;
}

export function savePending(pending: PendingSignIn): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

// read once and removed: a verifier is good for exactly one exchange
export function takePending(): PendingSignIn | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignIn> | null;
    return typeof parsed?.state === 'string' && typeof parsed.verifier === 'string'
      ? { state: parsed.state, verifier: parsed.verifier }
      : null;
  } catch {
    return null;
  }
}

export type CallbackResult =
  { kind: 'none' } | { kind: 'signed-in'; token: string } | { kind: 'failed'; message: string };

// what to do with the URL the hosted pages sent the browser back to. Strips the one-time code
// from the address bar before anything else, so it is never bookmarked or shared.
export async function completeSignIn(
  config: AdminConfig | null,
  fetcher: typeof fetch = fetch,
): Promise<CallbackResult> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const failure = url.searchParams.get('error');
  if (state === null || (code === null && failure === null)) return { kind: 'none' };

  const description = url.searchParams.get('error_description');
  for (const name of ['code', 'state', 'error', 'error_description']) {
    url.searchParams.delete(name);
  }
  window.history.replaceState(null, '', url);

  const pending = takePending();
  if (failure !== null) {
    return { kind: 'failed', message: description ?? `Sign-in was refused (${failure}).` };
  }
  const notThisTab: CallbackResult = {
    kind: 'failed',
    message: 'That sign-in did not start in this tab. Try again.',
  };
  if (config === null || code === null || pending === null) return notThisTab;
  // a state that doesn't match is a response to a sign-in this tab never started
  if (pending.state !== state) return notThisTab;
  try {
    const token = await exchangeCode(
      config,
      { code, verifier: pending.verifier, redirectUri: redirectUri() },
      fetcher,
    );
    return { kind: 'signed-in', token };
  } catch {
    return { kind: 'failed', message: 'Sign-in could not be completed. Try again.' };
  }
}
