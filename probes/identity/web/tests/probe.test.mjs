import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { test } from 'node:test';
import { authorizationParameters, createTransactionStore, completeCallback, verifyAccessToken } from '../probe.mjs';

const redirect = 'http://127.0.0.1:3000/auth/callback';
const issuer = 'https://example.auth0.com/';
const audience = 'https://api.example.test/';
const scope = 'BikeLog.Access';
const pending = () => ({ state: 'expected', nonce: 'nonce', verifier: 'verifier', redirectUri: redirect });
const callback = (state = 'expected') => `${redirect}?code=one-time-code&state=${state}`;
const options = (store, exchange) => ({ url: callback(), sessionId: 'session', store, redirectUri: redirect,
  expectedIssuer: issuer, expectedAudience: audience, expectedScope: scope, exchange });

test('requests the passwordless connection, API audience, scope, and PKCE', () => {
  assert.deepEqual(authorizationParameters({ redirectUri: redirect, apiAudience: audience, apiScope: scope,
    state: 'state', nonce: 'nonce', challenge: 'challenge' }), {
    redirect_uri: redirect, scope: `openid profile email offline_access ${scope}`, audience,
    connection: 'email', response_type: 'code', state: 'state', nonce: 'nonce',
    code_challenge: 'challenge', code_challenge_method: 'S256',
  });
});

test('rejects wrong state without exchanging a code', async () => {
  const store = createTransactionStore();
  store.put('session', pending());
  let called = false;
  await assert.rejects(completeCallback({ ...options(store, async () => { called = true; }), url: callback('wrong') }), /state/i);
  assert.equal(called, false);
});

test('passes nonce to OIDC exchange and rejects a nonce failure', async () => {
  const store = createTransactionStore();
  store.put('session', pending());
  await assert.rejects(completeCallback(options(store, async ({ expectedNonce }) => {
    assert.equal(expectedNonce, 'nonce');
    throw new Error('nonce mismatch');
  })), /authentication failed/i);
});

test('rejects a callback on a different redirect URI', async () => {
  const store = createTransactionStore();
  store.put('session', pending());
  await assert.rejects(completeCallback({ ...options(store, async () => {}),
    url: 'http://localhost:3000/auth/callback?code=x&state=expected' }), /redirect/i);
});

test('rejects missing code and consumes the callback once', async () => {
  const store = createTransactionStore();
  store.put('session', pending());
  await assert.rejects(completeCallback({ ...options(store, async () => {}),
    url: `${redirect}?state=expected` }), /missing code/i);
  await assert.rejects(completeCallback(options(store, async () => {})), /replay/i);
});

test('consumes callback after exchange failure', async () => {
  const store = createTransactionStore();
  store.put('session', pending());
  await assert.rejects(completeCallback(options(store, async () => { throw new Error('provider failure'); })), /authentication failed/i);
  await assert.rejects(completeCallback(options(store, async () => {})), /replay/i);
});

test('returns only sanitized verification flags for a valid Auth0 token', async () => {
  const store = createTransactionStore();
  store.put('session', pending());
  const result = await completeCallback(options(store, async () => ({
    claims: { iss: issuer, aud: [audience, 'https://other.example/'], scope: `openid ${scope}`, sub: 'auth0|private' },
    refreshTokenAvailable: true,
  })));
  assert.deepEqual(result, { issuerMatches: true, audienceMatches: true, scopeMatches: true,
    hasSubject: true, refreshTokenAvailable: true });
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('rejects wrong issuer, audience, scope, and missing subject', async () => {
  for (const claims of [
    { iss: 'https://wrong/', aud: audience, scope, sub: 'sub' },
    { iss: issuer, aud: 'wrong', scope, sub: 'sub' },
    { iss: issuer, aud: audience, scope: 'other', sub: 'sub' },
    { iss: issuer, aud: audience, scope },
  ]) {
    const store = createTransactionStore();
    store.put('session', pending());
    await assert.rejects(completeCallback(options(store, async () => ({ claims }))), /authentication failed/i);
  }
});

test('verifies JWT signature and exact claims with string or array audience', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'pilot-key';
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'pilot-key' })
    .setIssuer(issuer).setAudience(claims.aud ?? audience).setSubject('auth0|private')
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  for (const aud of [audience, [audience, 'https://other.example/']]) {
    const token = await sign({ aud, scope: `openid ${scope}` });
    const claims = await verifyAccessToken({ token, issuer, audience, scope, jwks });
    assert.equal(claims.sub, 'auth0|private');
  }
  const wrongKey = await generateKeyPair('RS256');
  const forged = new SignJWT({ scope }).setProtectedHeader({ alg: 'RS256', kid: 'pilot-key' })
    .setIssuer(issuer).setAudience(audience).setSubject('forged').setIssuedAt().setExpirationTime('5m')
    .sign(wrongKey.privateKey);
  await assert.rejects(verifyAccessToken({ token: forged, issuer, audience, scope, jwks }));
  for (const bad of [
    await sign({ aud: 'https://wrong/', scope }),
    new SignJWT({ scope }).setProtectedHeader({ alg: 'RS256', kid: 'pilot-key' })
      .setIssuer('https://wrong/').setAudience(audience).setSubject('sub').setIssuedAt().setExpirationTime('5m').sign(privateKey),
    await sign({ scope: 'other' }),
  ]) await assert.rejects(verifyAccessToken({ token: bad, issuer, audience, scope, jwks }));
});
