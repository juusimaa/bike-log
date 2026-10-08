import { randomBytes } from 'node:crypto';
import { jwtVerify } from 'jose';

function hasAudience(actual, expected) {
  return actual === expected || (Array.isArray(actual) && actual.includes(expected));
}

function hasScope(actual, expected) {
  return typeof actual === 'string' && actual.split(' ').includes(expected);
}

export async function verifyAccessToken({ token, issuer, audience, scope, jwks }) {
  const { payload } = await jwtVerify(token, jwks, { issuer, audience, algorithms: ['RS256'] });
  if (!hasScope(payload.scope, scope) || typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Access token is missing required claims');
  }
  return payload;
}

export function authorizationParameters({ redirectUri, apiAudience, apiScope, state, nonce, challenge }) {
  return {
    redirect_uri: redirectUri,
    scope: `openid profile email offline_access ${apiScope}`,
    audience: apiAudience,
    connection: 'email',
    response_type: 'code',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  };
}

export function createTransactionStore() {
  const transactions = new Map();
  return {
    put(sessionId, value) { transactions.set(sessionId, value); },
    consume(sessionId) {
      const value = transactions.get(sessionId);
      transactions.delete(sessionId);
      return value;
    },
  };
}

export function newSessionId() {
  return randomBytes(32).toString('base64url');
}

export async function completeCallback({ url, sessionId, store, redirectUri, expectedIssuer, expectedAudience,
  expectedScope, exchange }) {
  const transaction = store.consume(sessionId);
  if (!transaction) throw new Error('Callback replay or missing session');

  const actual = new URL(url);
  const expected = new URL(redirectUri);
  if (actual.origin !== expected.origin || actual.pathname !== expected.pathname ||
      transaction.redirectUri !== redirectUri || actual.hash) {
    throw new Error('Callback redirect mismatch');
  }
  if (!actual.searchParams.get('state') || actual.searchParams.get('state') !== transaction.state) {
    throw new Error('Callback state mismatch');
  }
  if (!actual.searchParams.get('code')) throw new Error('Authorization response missing code');

  let result;
  try {
    result = await exchange({
      currentUrl: actual,
      codeVerifier: transaction.verifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
    });
  } catch {
    throw new Error('Authentication failed; start sign-in again');
  }
  const claims = result?.claims;
  if (claims?.iss !== expectedIssuer || !hasAudience(claims?.aud, expectedAudience) ||
      !hasScope(claims?.scope, expectedScope) || typeof claims?.sub !== 'string' || !claims.sub) {
    throw new Error('Authentication failed; start sign-in again');
  }
  return {
    issuerMatches: true,
    audienceMatches: true,
    scopeMatches: true,
    hasSubject: true,
    refreshTokenAvailable: result.refreshTokenAvailable === true,
  };
}
