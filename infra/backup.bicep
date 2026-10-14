// What stays in Azure after the move to UpCloud (spec 005, research D10 and D12):
// backup storage, the write-only backup role and its two assignments, the owner's
// action group, the missed-backup alert and the budget. Run by the owner:
//   az deployment group create -g rg-bikelog-prod -f infra/backup.bicep \
//     -p .local/backup.local.bicepparam
// Names, properties and API versions match infra/bootstrap.bicep and
// infra/modules/alerts.bicep, so the first deployment adopts the existing resources
// and adds only the server's role assignment and the storage alert. Check with
// `az deployment group what-if` first.
targetScope = 'resourceGroup'

@description('Azure region for every regional resource.')
param location string = 'swedencentral'

@description('Owner email for alerts and budget notifications. Supplied at deploy time; never committed.')
param ownerAlertEmail string

@description('Object ID of the owner (Entra user), who reads backups for restore rehearsals.')
param ownerPrincipalId string

@description('Object ID of the service principal of the "Bike Log backup (UpCloud)" app registration.')
param backupPrincipalId string

@description('The budget start date already in use (budgets keep their start date): az consumption budget show -g rg-bikelog-prod --budget-name budget-bikelog --query timePeriod.startDate')
param budgetStartDate string

@description('The budget end date already in use; Azure sets one 10 years after the start when none is given. Empty leaves it to Azure.')
param budgetEndDate string = ''

@description('Suffix for globally unique names; the same default bootstrap.bicep used.')
param suffix string = uniqueString(resourceGroup().id)

var storageBlobDataReader = '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'

resource budget 'Microsoft.Consumption/budgets@2026-06-01' = {
  name: 'budget-bikelog'
  properties: {
    category: 'Cost'
    amount: 10
    timeGrain: 'Monthly'
    timePeriod: union({ startDate: budgetStartDate }, empty(budgetEndDate) ? {} : { endDate: budgetEndDate })
    notifications: {
      actual50: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: [ownerAlertEmail]
      }
      actual80: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: [ownerAlertEmail]
      }
      forecast100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: [ownerAlertEmail]
      }
    }
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: 'stbikelog${suffix}'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
  }
}

// Soft delete and the encryption scope are stated as Azure already has them, so a
// redeployment reports no change.
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: false
      allowPermanentDelete: false
    }
  }
}

resource backups 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  parent: blobService
  name: 'backups'
  properties: {
    publicAccess: 'None'
    defaultEncryptionScope: '$account-encryption-key'
    denyEncryptionScopeOverride: false
  }
}

// 35 days covers the 30-day minimum plus the rule's up-to-24-hour delay (spec 004 research D9).
resource retention 'Microsoft.Storage/storageAccounts/managementPolicies@2025-01-01' = {
  parent: storage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'delete-after-35-days'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['backups/']
            }
            actions: {
              baseBlob: {
                delete: {
                  daysAfterCreationGreaterThan: 35
                }
              }
            }
          }
        }
      ]
    }
  }
}

// Create-only: blobs/add/action writes new blobs but cannot overwrite them, and there is
// no delete action, so the backup job cannot destroy earlier backups.
resource backupWriter 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'bike-log-backup-writer')
  properties: {
    roleName: 'Bike Log Backup Writer (${resourceGroup().name})'
    description: 'Create new backup blobs and read them; no overwrite or delete.'
    type: 'CustomRole'
    assignableScopes: [resourceGroup().id]
    permissions: [
      {
        actions: []
        notActions: []
        dataActions: [
          'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/add/action'
          'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'
        ]
        notDataActions: []
      }
    ]
  }
}

// The UpCloud server's backup job, signing in with its certificate (research D10).
resource serverBackupWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: backups
  name: guid(backups.id, backupPrincipalId, backupWriter.id)
  properties: {
    // Azure stores custom role IDs at subscription scope; the same form keeps what-if clean.
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', backupWriter.name)
    principalId: backupPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// The owner lists and downloads backups for restore rehearsals (--auth-mode login).
resource ownerBackupReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: backups
  name: guid(backups.id, ownerPrincipalId, storageBlobDataReader)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataReader)
    principalId: ownerPrincipalId
    principalType: 'User'
  }
}

resource owner 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-bikelog-owner'
  location: 'global'
  properties: {
    groupShortName: 'bikelog'
    enabled: true
    emailReceivers: [
      {
        name: 'owner'
        emailAddress: ownerAlertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

// A complete backup is two successful Put Blob calls (dump and manifest); the refused
// writes of `backup-verify-permissions` are not successes. Fires for missed and failed
// runs alike. Whether Azure evaluates a day with no PutBlob series at all as zero is
// proven by quickstart U8 (timer stopped for a day), not assumed.
resource backupMissing 'Microsoft.Insights/metricAlerts@2026-01-01' = {
  name: 'alert-backup-missing-blobs'
  location: 'global'
  properties: {
    description: 'Fewer than two successful backup uploads in the last 24 hours.'
    severity: 2
    enabled: true
    scopes: [blobService.id]
    evaluationFrequency: 'PT1H'
    windowSize: 'P1D'
    targetResourceType: 'Microsoft.Storage/storageAccounts/blobServices'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'successful-puts'
          metricNamespace: 'Microsoft.Storage/storageAccounts/blobServices'
          metricName: 'Transactions'
          dimensions: [
            {
              name: 'ApiName'
              operator: 'Include'
              values: ['PutBlob']
            }
            {
              name: 'ResponseType'
              operator: 'Include'
              values: ['Success']
            }
          ]
          operator: 'LessThan'
          threshold: 2
          timeAggregation: 'Total'
        }
      ]
    }
    actions: [
      {
        actionGroupId: owner.id
      }
    ]
  }
}

output storageAccountName string = storage.name
output storageBlobUrl string = storage.properties.primaryEndpoints.blob
