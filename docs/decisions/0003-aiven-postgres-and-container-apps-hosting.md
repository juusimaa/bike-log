# Aiven PostgreSQL and Azure Container Apps hosting

> The Container Apps hosting part is superseded by [decision 0007](0007-upcloud-hosting.md) (2026-10-14). The Aiven choice stands.

Approved hosting: the hosted database is a single Aiven for PostgreSQL service on Aiven's free plan in an EU region. Web, API and the later worker run on Azure Container Apps (Consumption plan) in a nearby European Azure region, within the monthly free grant. Local development keeps Docker PostgreSQL. This replaces the earlier Neon Free choice in [0001-local-backend.md](0001-local-backend.md) and the design specification. Decided by the owner on 2026-10-13.

Context: a European provider was preferred for the hosted database. Aiven is headquartered in Finland. Its free PostgreSQL plan has no time limit and includes backups and monitoring. It runs a single node with 1 CPU, 1 GB RAM and 1 GB disk, and allows at most 20 connections without connection pooling. It also excludes VPCs, static IPs, integrations and forking, and support. Aiven may power off a new free service that has no usage in its first few hours. Unlike Neon Free, the service does not scale to zero, so there is no cold-start delay after inactivity ([free tier](https://aiven.io/docs/products/postgresql/concepts/pg-free-tier), [free plan](https://aiven.io/docs/platform/concepts/free-plan)). The Container Apps Consumption plan includes a monthly per-subscription free grant of vCPU-seconds, GiB-seconds and requests ([billing](https://learn.microsoft.com/en-us/azure/container-apps/billing)).

Configuration rules:

- Choose the Aiven and Azure regions together and keep them close, because every API request waits on the database.
- Cap Npgsql pools so that every replica plus migration and worker connections stays below 20 (for example `Maximum Pool Size=5` per API replica, with a bounded replica count). Revisit this before adding replicas or the worker.
- Connect with TLS (`SSL Mode=VerifyFull`) using Aiven's CA certificate. Store the connection string as a protected secret in Key Vault, never in source or Bicep parameters.
- Because a static IP is unavailable, restrict access with Aiven's IP allow-list where practical. The credentials and TLS remain the primary protection.
- Create the Aiven service by hand and document the setup separately; Bicep manages only Azure resources.

Alternatives rejected: Neon Free (US company, 0.5 GB storage, scale-to-zero cold starts); Scaleway Serverless SQL (pay per use, not free); Clever Cloud (small development database only); Nhost (backend-as-a-service shape rather than plain PostgreSQL); Azure Database for PostgreSQL (no ongoing free tier).

Consequences: the free grant covers only Container Apps compute and requests. The container registry, Service Bus, Key Vault, Blob Storage and Azure Monitor telemetry can still incur charges, so the cost-approval and budget rules still apply. Aiven free-plan backups do not count as a tested recovery procedure; backup and restoration must still be exercised before relying on hosted records. Moving off the free plan, or past its 1 GB disk or 20-connection limit, needs a new cost estimate and the owner's approval. Hosting real data still requires the ordinary release gates, including sign-in and ownership enforcement.
