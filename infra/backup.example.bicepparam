// Placeholders only. Copy to .local/backup.local.bicepparam (ignored), change the
// `using` path to '../infra/backup.bicep' and fill in real values.
using 'backup.bicep'

param ownerAlertEmail = 'owner@example.com'
// az ad signed-in-user show --query id -o tsv
param ownerPrincipalId = '00000000-0000-0000-0000-000000000000'
// az ad sp show --id <backup app registration client id> --query id -o tsv
param backupPrincipalId = '00000000-0000-0000-0000-000000000000'
// The budget's existing dates, exactly as Azure returns them:
// az consumption budget show -g rg-bikelog-prod --budget-name budget-bikelog --query timePeriod
param budgetStartDate = '2026-11-01T00:00:00Z'
param budgetEndDate = '2036-11-01T00:00:00Z'
