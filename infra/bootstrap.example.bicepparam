// Placeholders only. Copy to .local/bootstrap.local.bicepparam (ignored), change the
// `using` path to '../infra/bootstrap.bicep' and fill in real values.
using 'bootstrap.bicep'

param ownerAlertEmail = 'owner@example.com'
// az ad signed-in-user show --query id -o tsv
param ownerPrincipalId = '00000000-0000-0000-0000-000000000000'
// The first day of the current month.
param budgetStartDate = '2026-11-01'
