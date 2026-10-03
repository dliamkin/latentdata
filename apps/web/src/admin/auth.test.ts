import { afterEach, describe, expect, it, vi } from 'vitest';

import { API, AUTH, CLIENT_ID, fakeToken } from '../test/admin.ts';
import {
  adminConfig,
  authorizeUrl,
  challengeFor,
  completeSignIn,
  exchangeCode,
  isLive,
  readToken,
  savePending,
  signOutUrl,
  tokenExpiry,
  writeToken,
  type AdminConfig,
} from './auth.ts';

const config: AdminConfig = { apiBaseUrl: API, authDomain: AUTH, clientId: CLIENT_ID };

function tokenResponse(body: unknown, status = 200): typeof fetch {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('adminConfig', () => {
  it('needs all three values', () => {
    expect(adminConfig({})).toBeNull();
    expect(adminConfig({ VITE_API_BASE_URL: API, VITE_COGNITO_DOMAIN: AUTH })).toBeNull();
    expect(
      adminConfig({
        VITE_API_BASE_URL: `${API}/`,
        VITE_COGNITO_DOMAIN: AUTH,
        VITE_COGNITO_CLIENT_ID: CLIENT_ID,
      }),
    ).toEqual(config);
  });
});

describe('pkce', () => {
  it('derives the challenge RFC 7636 gives for its example verifier', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('asks for a code with an S256 challenge, never a token', () => {
    const url = new URL(
      authorizeUrl(config, { state: 's1', challenge: 'c1', redirectUri: 'https://site.example/' }),
    );
    expect(url.origin + url.pathname).toBe(`${AUTH}/oauth2/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: 'https://site.example/',
      scope: 'openid email',
      state: 's1',
      code_challenge: 'c1',
      code_challenge_method: 'S256',
    });
  });

  it('builds the hosted sign-out link', () => {
    expect(signOutUrl(config, 'https://site.example/')).toBe(
      `${AUTH}/logout?client_id=${CLIENT_ID}&logout_uri=https%3A%2F%2Fsite.example%2F`,
    );
  });
});

describe('tokens', () => {
  it('reads the expiry and refuses anything that is not a live token', () => {
    const live = fakeToken(600);
    expect(tokenExpiry(live)).toBeGreaterThan(Date.now());
    expect(isLive(live)).toBe(true);
    expect(isLive(fakeToken(-5))).toBe(false);
    expect(tokenExpiry('secret')).toBeNull();
    expect(isLive('not.a.token')).toBe(false);
  });

  it('does not hand back a stored token that has expired', () => {
    writeToken(fakeToken(-5));
    expect(readToken()).toBeNull();
    const live = fakeToken();
    writeToken(live);
    expect(readToken()).toBe(live);
  });

  it('exchanges the code with the verifier and keeps only the ID token', async () => {
    const idToken = fakeToken();
    const fetcher = tokenResponse({ id_token: idToken, refresh_token: 'long-lived' });
    const result = await exchangeCode(
      config,
      { code: 'abc', verifier: 'v1', redirectUri: 'https://site.example/' },
      fetcher,
    );
    expect(result).toBe(idToken);
    const [url, init] = vi.mocked(fetcher).mock.calls[0] ?? [];
    expect(url).toBe(`${AUTH}/oauth2/token`);
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: 'abc',
      redirect_uri: 'https://site.example/',
      code_verifier: 'v1',
    });
  });

  it('fails the exchange on a refusal or an unusable token', async () => {
    const exchange = { code: 'abc', verifier: 'v1', redirectUri: 'https://site.example/' };
    await expect(exchangeCode(config, exchange, tokenResponse({}, 400))).rejects.toThrow();
    await expect(
      exchangeCode(config, exchange, tokenResponse({ id_token: fakeToken(-5) })),
    ).rejects.toThrow();
  });
});

describe('completeSignIn', () => {
  it('does nothing on an ordinary page load', async () => {
    window.history.replaceState(null, '', '/?offer=some-offer');
    expect(await completeSignIn(config, tokenResponse({}))).toEqual({ kind: 'none' });
    expect(window.location.search).toBe('?offer=some-offer');
  });

  it('trades a matching code for a token and takes the code out of the address bar', async () => {
    const idToken = fakeToken();
    savePending({ state: 's1', verifier: 'v1' });
    window.history.replaceState(null, '', '/?code=abc&state=s1');
    const result = await completeSignIn(config, tokenResponse({ id_token: idToken }));
    expect(result).toEqual({ kind: 'signed-in', token: idToken });
    expect(window.location.search).toBe('');
  });

  it('refuses a response whose state this tab never issued, without calling out', async () => {
    const fetcher = tokenResponse({ id_token: fakeToken() });
    savePending({ state: 's1', verifier: 'v1' });
    window.history.replaceState(null, '', '/?code=abc&state=forged');
    expect((await completeSignIn(config, fetcher)).kind).toBe('failed');
    expect(fetcher).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('uses a verifier once', async () => {
    savePending({ state: 's1', verifier: 'v1' });
    window.history.replaceState(null, '', '/?code=abc&state=s1');
    await completeSignIn(config, tokenResponse({ id_token: fakeToken() }));
    window.history.replaceState(null, '', '/?code=abc&state=s1');
    expect((await completeSignIn(config, tokenResponse({ id_token: fakeToken() }))).kind).toBe(
      'failed',
    );
  });

  it('reports what the hosted pages said when they refuse', async () => {
    savePending({ state: 's1', verifier: 'v1' });
    window.history.replaceState(
      null,
      '',
      '/?error=access_denied&error_description=User+cancelled&state=s1',
    );
    expect(await completeSignIn(config, tokenResponse({}))).toEqual({
      kind: 'failed',
      message: 'User cancelled',
    });
  });
});
