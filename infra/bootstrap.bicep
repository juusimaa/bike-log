// Run once by the owner (research D3), after docs/hosting/cost-estimate.md is approved:
//   az deployment group create -g rg-bikelog-prod -f infra/bootstrap.bicep \
//     -p .local/bootstrap.local.bicepparam
// It creates everything that needs role assignments, so CI (main.bicep) never does.
targetScope = 'resourceGroup'

@description('Azure region for every resource.')
param location string = 'swedencentral'

@description('Owner email for budget notifications. Supplied at deploy time; never committed.')
param ownerAlertEmail string

@description('Object ID of the owner (Entra user) who sets Key Vault secrets and reads backups.')
param ownerPrincipalId string

@description('First day of the current or a later month, for example 2026-11-01.')
param budgetStartDate string

@description('The repository part of GitHub OIDC subjects. This repository uses immutable subjects, which carry the owner and repository IDs; read it with: gh api repos/<owner>/<repo>/actions/oidc/customization/sub --jq .sub_claim_prefix')
param githubSubjectPrefix string = 'repo:juusimaa@1575723/bike-log@1399786181'

@description('Suffix for globally unique names. main.bicep derives the same default.')
param suffix string = uniqueString(resourceGroup().id)

// Built-in role definition IDs.
var roles = {
  contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
  keyVaultSecretsOfficer: 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
  storageBlobDataReader: '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'
}

resource budget 'Microsoft.Consumption/budgets@2026-06-01' = {
  name: 'budget-bikelog'
  properties: {
    category: 'Cost'
    amount: 10
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
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

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: 'id-bikelog-app'
  location: location
}

resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: 'id-bikelog-deploy'
  location: location
}

// Short-lived GitHub OIDC tokens, only for jobs in the protected `production` environment.
resource githubProduction 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2024-11-30' = {
  parent: deployIdentity
  name: 'github-production'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    audiences: ['api://AzureADTokenExchange']
    subject: '${githubSubjectPrefix}:environment:production'
  }
}

resource vault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: 'kv-bikelog-${suffix}'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 7
    // Container Apps on the Consumption profile has no private endpoint (research D1).
    publicNetworkAccess: 'Enabled'
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

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' = {
  parent: storage
  name: 'default'
}

resource backups 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  parent: blobService
  name: 'backups'
  properties: {
    publicAccess: 'None'
  }
}

// 35 days covers the 30-day minimum plus the rule's up-to-24-hour delay (research D9).
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
// no delete action, so the backup job cannot destroy earlier backups (research D9).
// Role names are unique per tenant, so the resource group name keeps a recreated
// environment (quickstart C9) from colliding.
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

resource appSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, appIdentity.id, roles.keyVaultSecretsUser)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.keyVaultSecretsUser
    )
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appBackupWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: backups
  name: guid(backups.id, appIdentity.id, backupWriter.id)
  properties: {
    roleDefinitionId: backupWriter.id
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource deployContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deployIdentity.id, roles.contributor)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.contributor
    )
    principalId: deployIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource ownerSecretsOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, ownerPrincipalId, roles.keyVaultSecretsOfficer)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.keyVaultSecretsOfficer
    )
    principalId: ownerPrincipalId
    principalType: 'User'
  }
}

// The owner lists and downloads backups for restore rehearsals (--auth-mode login).
resource ownerBackupReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: backups
  name: guid(backups.id, ownerPrincipalId, roles.storageBlobDataReader)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.storageBlobDataReader
    )
    principalId: ownerPrincipalId
    principalType: 'User'
  }
}

output appIdentityName string = appIdentity.name
output appIdentityClientId string = appIdentity.properties.clientId
output deployIdentityName string = deployIdentity.name
output deployIdentityClientId string = deployIdentity.properties.clientId
output keyVaultName string = vault.name
output storageAccountName string = storage.name
output storageBlobUrl string = storage.properties.primaryEndpoints.blob
