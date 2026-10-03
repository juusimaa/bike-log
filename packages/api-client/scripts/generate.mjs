import { readFile, writeFile, mkdir } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
const response = await fetch('http://127.0.0.1:5080/openapi/v1.json', {
    redirect: 'error',
    cache: 'no-store',
});
if (!response.ok) throw new Error(`OpenAPI fetch failed: ${response.status}`);
const schema = await response.json();
// ASP.NET format-only DateTimeOffset: ISO strings, preserving nullable wire fields.
const nullableDates = new Set(['endUtc', 'calculatedAtUtc', 'baselineUtc']);
const typeSchema = structuredClone(schema);
for (const dto of Object.values(typeSchema.components.schemas)) {
    for (const [name, property] of Object.entries(dto.properties ?? {})) {
        if (property.format === 'date-time' && !property.type)
            property.type = nullableDates.has(name)
                ? ['string', 'null']
                : 'string';
    }
}
const output = astToString(await openapiTS(typeSchema));
const artifacts = [
    ['openapi.json', JSON.stringify(schema, null, 2) + '\n'],
    ['src/generated/schema.d.ts', output],
];
await mkdir('src/generated', { recursive: true });
for (const [path, content] of artifacts) {
    if (process.argv.includes('--check')) {
        if ((await readFile(path, 'utf8')) !== content)
            throw new Error(`OpenAPI drift: ${path}; run npm run api:generate`);
    } else await writeFile(path, content);
}
console.log(
    process.argv.includes('--check')
        ? 'OpenAPI snapshot and generated types match local API.'
        : 'Generated OpenAPI snapshot and types.',
);
