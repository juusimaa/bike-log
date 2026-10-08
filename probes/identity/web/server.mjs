import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import * as oidc from 'openid-client';
import { createRemoteJWKSet } from 'jose';
import { authorizationParameters, completeCallback, createTransactionStore, newSessionId,
  verifyAccessToken } from './probe.mjs';

const proofRoot = new URL('../../../.local/identity-proof/', import.meta.url);
const settings = JSON.parse(await readFile(new URL('auth0-config.json', proofRoot), 'utf8'));
const credential = JSON.parse(await readFile(new URL('auth0-web-client-secret.json', proofRoot), 'utf8'));
const redirectUri = settings.redirectUri;
const expectedHost = new URL(redirectUri).host;
const issuer = settings.issuer;
const client = await oidc.discovery(new URL(issuer), settings.webClientId, credential.clientSecret);
const jwks = createRemoteJWKSet(new URL(client.serverMetadata().jwks_uri));
const store = createTransactionStore();

function cookieValue(header, name) {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function respond(response, status, text, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(text);
}

createServer(async (request, response) => {
  if (request.headers.host !== expectedHost) return respond(response, 400, 'Wrong host');
  const url = new URL(request.url, redirectUri);
  if (url.pathname === '/') {
    return respond(response, 200, 'Bike Log disposable identity proof. Open /login to begin.');
  }
  if (url.pathname === '/login') {
    const sessionId = newSessionId();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const verifier = oidc.randomPKCECodeVerifier();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    store.put(sessionId, { state, nonce, verifier, redirectUri });
    const destination = oidc.buildAuthorizationUrl(client, authorizationParameters({
      redirectUri, apiAudience: settings.apiAudience, apiScope: settings.apiScope,
      state, nonce, challenge,
    }));
    response.writeHead(302, {
      Location: destination.href,
      'Set-Cookie': `proof_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/auth/callback; Max-Age=600`,
      'Cache-Control': 'no-store',
    });
    return response.end();
  }
  if (url.pathname === '/auth/callback') {
    const sessionId = cookieValue(request.headers.cookie, 'proof_session');
    try {
      const result = await completeCallback({
        url: url.href,
        sessionId,
        store,
        redirectUri,
        expectedIssuer: issuer,
        expectedAudience: settings.apiAudience,
        expectedScope: settings.apiScope,
        exchange: async ({ currentUrl, codeVerifier, expectedState, expectedNonce }) => {
          const tokens = await oidc.authorizationCodeGrant(client, currentUrl, {
            pkceCodeVerifier: codeVerifier,
            expectedState,
            expectedNonce,
          });
          const claims = await verifyAccessToken({ token: tokens.access_token, issuer,
            audience: settings.apiAudience, scope: settings.apiScope, jwks });
          return { claims, refreshTokenAvailable: typeof tokens.refresh_token === 'string' };
        },
      });
      return respond(response, 200, JSON.stringify(result, null, 2), {
        'Set-Cookie': 'proof_session=; HttpOnly; SameSite=Lax; Path=/auth/callback; Max-Age=0',
      });
    } catch {
      return respond(response, 400, 'Authentication failed; open /login to try again.', {
        'Set-Cookie': 'proof_session=; HttpOnly; SameSite=Lax; Path=/auth/callback; Max-Age=0',
      });
    }
  }
  return respond(response, 404, 'Not found');
}).listen(3000, '127.0.0.1', () => {
  process.stdout.write('Disposable identity probe ready at http://127.0.0.1:3000/login\n');
});
