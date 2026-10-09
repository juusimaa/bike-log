import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
} from 'node:crypto';
import type pg from 'pg';

export type TokenEnvelope = {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number;
    scope: string;
};

export type SessionRecord = {
    issuer: string;
    subject: string;
    tokens: TokenEnvelope;
    rotationVersion: number;
    expiresAt: number;
};

export type LoginTransaction = {
    nonce: string;
    verifier: string;
    returnTo: string;
};

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_LIFETIME_MS = 10 * 60 * 1000;

function hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export class SessionStore {
    constructor(
        private readonly pool: pg.Pool,
        private readonly key: Buffer,
        private readonly now: () => number = Date.now,
    ) {
        if (key.length !== 32)
            throw new Error('A 32-byte session protection key is required.');
    }

    private encrypt(value: unknown): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv);
        const encrypted = Buffer.concat([
            cipher.update(JSON.stringify(value), 'utf8'),
            cipher.final(),
        ]);
        return [iv, cipher.getAuthTag(), encrypted]
            .map((part) => part.toString('base64url'))
            .join('.');
    }

    private decrypt<T>(value: string): T {
        const parts = value.split('.');
        if (parts.length !== 3)
            throw new Error('Invalid protected session payload.');
        const [iv, tag, encrypted] = parts.map((part) =>
            Buffer.from(part, 'base64url'),
        );
        if (iv.length !== 12 || tag.length !== 16)
            throw new Error('Invalid protected session payload.');
        const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
        decipher.setAuthTag(tag);
        return JSON.parse(
            Buffer.concat([
                decipher.update(encrypted),
                decipher.final(),
            ]).toString('utf8'),
        ) as T;
    }

    async create(
        identity: { issuer: string; subject: string },
        tokens: TokenEnvelope,
    ): Promise<string> {
        if (
            !identity.issuer ||
            !identity.subject ||
            !tokens.accessToken ||
            tokens.expiresAt <= this.now()
        ) {
            throw new Error(
                'A current token and external identity are required.',
            );
        }
        const id = randomBytes(32).toString('base64url');
        const now = new Date(this.now());
        await this.pool.query(
            `INSERT INTO "WebSessions" ("SessionIdHash", "EncryptedTokens", "Issuer", "Subject", "ExpiresAtUtc", "RotationVersion", "CreatedAtUtc", "UpdatedAtUtc")
             VALUES ($1, $2, $3, $4, $5, 0, $6, $6)`,
            [
                hash(id),
                this.encrypt(tokens),
                identity.issuer,
                identity.subject,
                new Date(now.getTime() + SESSION_LIFETIME_MS),
                now,
            ],
        );
        return id;
    }

    async get(id: string): Promise<SessionRecord | null> {
        if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return null;
        const result = await this.pool.query(
            `SELECT "EncryptedTokens", "Issuer", "Subject", "ExpiresAtUtc", "RotationVersion"
             FROM "WebSessions" WHERE "SessionIdHash" = $1 AND "ExpiresAtUtc" > $2`,
            [hash(id), new Date(this.now())],
        );
        const row = result.rows[0];
        if (!row) return null;
        try {
            return {
                issuer: row.Issuer,
                subject: row.Subject,
                tokens: this.decrypt<TokenEnvelope>(row.EncryptedTokens),
                rotationVersion: row.RotationVersion,
                expiresAt: new Date(row.ExpiresAtUtc).getTime(),
            };
        } catch {
            return null;
        }
    }

    async rotate(
        id: string,
        expectedVersion: number,
        tokens: TokenEnvelope,
    ): Promise<boolean> {
        if (!/^[A-Za-z0-9_-]{43}$/.test(id) || tokens.expiresAt <= this.now())
            return false;
        const result = await this.pool.query(
            `UPDATE "WebSessions" SET "EncryptedTokens" = $1, "RotationVersion" = "RotationVersion" + 1, "UpdatedAtUtc" = $2
             WHERE "SessionIdHash" = $3 AND "RotationVersion" = $4 AND "ExpiresAtUtc" > $2`,
            [
                this.encrypt(tokens),
                new Date(this.now()),
                hash(id),
                expectedVersion,
            ],
        );
        return result.rowCount === 1;
    }

    async delete(id: string): Promise<void> {
        if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return;
        await this.pool.query(
            'DELETE FROM "WebSessions" WHERE "SessionIdHash" = $1',
            [hash(id)],
        );
    }

    async createLoginTransaction(
        state: string,
        nonce: string,
        verifier: string,
        returnTo: string,
    ): Promise<void> {
        if (!state || !nonce || !verifier)
            throw new Error('State, nonce, and PKCE verifier are required.');
        const now = new Date(this.now());
        await this.pool.query(
            `INSERT INTO "OidcLoginTransactions" ("StateHash", "EncryptedNonceAndVerifier", "ReturnPath", "ExpiresAtUtc", "CreatedAtUtc")
             VALUES ($1, $2, $3, $4, $5)`,
            [
                hash(state),
                this.encrypt({ nonce, verifier }),
                returnTo,
                new Date(now.getTime() + LOGIN_LIFETIME_MS),
                now,
            ],
        );
    }

    async consumeLoginTransaction(
        state: string,
    ): Promise<LoginTransaction | null> {
        if (!state) return null;
        const result = await this.pool.query(
            `DELETE FROM "OidcLoginTransactions" WHERE "StateHash" = $1 AND "ExpiresAtUtc" > $2
             RETURNING "EncryptedNonceAndVerifier", "ReturnPath"`,
            [hash(state), new Date(this.now())],
        );
        const row = result.rows[0];
        if (!row) return null;
        const { nonce, verifier } = this.decrypt<{
            nonce: string;
            verifier: string;
        }>(row.EncryptedNonceAndVerifier);
        return { nonce, verifier, returnTo: row.ReturnPath };
    }
}
