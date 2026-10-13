# Local backend foundation

Approved architecture: .NET API with Docker PostgreSQL locally; Neon hosted PostgreSQL later. Synthetic loopback development only until authentication is delivered.

Pinned on 2026-10-01: SDK 10.0.401; ASP.NET OpenAPI/API testing and EF Core 10.0.12; Npgsql EF provider 10.0.3; xUnit 2.9.3; runner 4.0.0; test SDK 18.10.1. PostgreSQL 17 image digest: `sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f`.

Sources: [.NET releases](https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json), [Npgsql](https://www.npgsql.org/efcore/release-notes/10.0.html), NuGet stable package indices and Docker's resolved official image digest.

The execution environment's global SDK was older. A temporary SDK was installed under `/tmp/bikelog-sdk` without changing the global installation; verification uses `BIKELOG_DOTNET=/tmp/bikelog-sdk/dotnet`.

All relevant writes acquire a transaction-scoped PostgreSQL advisory lock derived from the SHA-256 of the owner ID. It serializes small per-owner workloads across API processes so overlap checks and projection rebuilding see current history. Hash collisions would only serialize unrelated owners. Replace this approach when measured workloads justify a narrower lock strategy; do not remove serialization without preserving allocation/overlap correctness.

EF Core Relational is pinned explicitly to 10.0.12, matching EF Core and EF tooling. The provider's lower compatible transitive version caused assembly-version build warnings until this alignment.


2026-10-02 UI-backend support extends the same synchronous architecture to four positions, metadata, paged discovery, complete replacement, separate estimates and oil/wax rules. The foundation's chain-only and zero-estimate restrictions are historical. Additive migrations and explicit `rebuild-usage` preserve local data; each owner's projections commit atomically under the existing lock. Startup performs neither. After upgrade, roll back only to application code compatible with new types and nullable legacy/custom names. No database reset, cloud deployment or client integration is part of this milestone.

2026-10-13 upgrade: PostgreSQL 18.6 image digest `sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336`, mounted at `/var/lib/postgresql` in a new `postgres18-data` volume. The PostgreSQL 17 volume is left untouched; recreate local data with `migrate`, or move it across with `pg_dump`/`pg_restore`. xUnit moved to `xunit.v3` 4.0.2 (runner 4.0.1) on Microsoft Testing Platform, opted in through `global.json`, so tests run with `dotnet test --solution`. Rule xUnit1051 is suppressed until tests adopt `TestContext.Current.CancellationToken`. TypeScript is 6.0.3 for the web app and workspace root. `@bikelog/api-client` stays on 5.9.3 because `openapi-typescript` 7.13.0 requires TypeScript 5. TypeScript 7 is blocked because `typescript-eslint`, used by `eslint-config-next`, supports only versions below 6.1.
