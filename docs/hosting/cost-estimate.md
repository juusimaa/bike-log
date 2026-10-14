# Hosted cost estimate

**Date**: 2026-10-13 · **Region**: Sweden Central · **Currency**: EUR, Azure retail prices on that date

This estimate covers the resources in [specs/004-hosted-deployment/data-model.md](../../specs/004-hosted-deployment/data-model.md).
No Azure resource may be created until the owner approves it below (FR-024, research D18).

## Resources

| Resource | Unit price | Expected use | Expected €/month |
| --- | --- | --- | --- |
| Container Apps (`ca-bikelog` and 3 jobs, Consumption profile) | Monthly free grant: 180,000 vCPU-s, 360,000 GiB-s, 2M requests | 0.5 vCPU / 1 GiB per active replica, so about 100 active hours a month are free. Scales to zero when idle. Jobs run a few minutes a day. | 0.00 |
| Log Analytics `log-bikelog` | 5 GB/month free, then €2.63/GB | Daily cap 0.15 GB (≤ 4.5 GB/month) | 0.00 |
| Key Vault `kv-bikelog-<suffix>` | €0.0264 per 10,000 operations | A few thousand secret reads a month | 0.01 |
| Storage `stbikelog<suffix>` (Hot LRS) | €0.0162/GB-month; writes €0.044 per 10,000 | 35 daily dumps of a few MB; 2 writes a day | 0.01–0.05 |
| Metric alerts (2) | About €0.10 each per month | `alert-backup-missing`, `alert-app-restarts` | 0.20 |
| Action group email | Free at this volume | A few emails a month | 0.00 |
| Budget `budget-bikelog` | Free | — | 0.00 |
| Managed identities (2), custom role | Free | — | 0.00 |
| Aiven for PostgreSQL, free plan | €0 | 1 GB disk, 20 connections. Region is chosen by Aiven and must be in the EU (research D16). | 0.00 |

**Expected total**: €0.50–€2 a month, allowing for egress and rounding.

## Budget

- **Approved budget**: €10 a month, resource group scope.
- **Notifications**: actual 50%, actual 80%, forecast 100%, emailed to the owner.
- Cost data lags by up to a day.

## Excluded charges (do not enable)

| Setting | Why it is excluded |
| --- | --- |
| Private endpoints, Dedicated workload profiles, planned maintenance window | Each triggers Dedicated Plan Management, about €83 a month. |
| NAT gateway (static outbound IP) | About €30 or more a month (research D1, D17). |
| `minReplicas` above 0 | The idle rate is charged around the clock. |
| Aiven paid plan | Needed only if the free service lands outside the EU (research D16); requires a new estimate. |

Any of these needs a new estimate and a new owner approval (FR-026).

## Approval

Approved by owner: ____ (date)
