import { describe, it, expect } from 'vitest';
import { decodeJson } from '../src/codec';
describe('safe JSON transport', () => {
    it('preserves cents and nullable metadata', () => {
        expect(
            decodeJson(
                '{"cost":24.90,"kind":null,"method":null,"durationSeconds":null}',
            ),
        ).toEqual({
            cost: 24.9,
            kind: null,
            method: null,
            durationSeconds: null,
        });
    });
    it('rejectsUnsafeNumericTokens', () => {
        for (const token of [
            '9223372036854775807',
            '9007199254740992',
            '1e309',
            '90071992547409.92',
            '90071992547409.91',
            '0.001',
        ])
            expect(() => decodeJson(`{"cost":${token}}`)).toThrow();
    });
    it('rejects malformed JSON', () => {
        expect(() => decodeJson('{"cost":')).toThrow();
    });
    it('preserves decimal exponent tokens exactly', () => {
        expect(decodeJson('{"cost":2.49e1,"version":9e2}')).toEqual({
            cost: 24.9,
            version: 900,
        });
    });
});
