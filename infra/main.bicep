// Run by the deploy workflow with Contributor on the resource group (research D3, D12).
// It declares no role assignments or role definitions; bootstrap.bicep holds those.
targetScope = 'resourceGroup'

param location string = 'swedencentral'

@description('Same suffix bootstrap.bicep used, so existing names resolve.')
param suffix string = uniqueString(resourceGroup().id)

@description('Full ghcr.io/...@sha256: references.')
param webImage string
param apiImage string
param migrationsImage string
param backupImage string

param auth0Issuer string
param auth0Audience string
param auth0ClientId string

@description('Aiven host name; checked by the operator job before it writes (research D6).')
param aivenDatabaseHost string

@description('Receives backup and restart alerts. Supplied at deploy time; never committed.')
param ownerAlertEmail string

@description('Address ranges allowed to reach the app. Empty opens it to the internet.')
param allowedIngressCidrs array = []

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: 'id-bikelog-app'
}

resource vault 'Microsoft.KeyVault/vaults@2024-11-01' existing = {
  name: 'kv-bikelog-${suffix}'
}

resource storage 'Microsoft.Storage/storageAccounts@2025-01-01' existing = {
  name: 'stbikelog${suffix}'
}

resource logs 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: 'log-bikelog'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    // Stays inside the 5 GB monthly free allowance (research D10).
    workspaceCapping: {
      dailyQuotaGb: json('0.15')
    }
  }
}

// Consumption profile only: no virtual network, private endpoints or maintenance window,
// each of which adds Dedicated Plan Management charges (research D1).
resource environment 'Microsoft.App/managedEnvironments@2026-07-01' = {
  name: 'cae-bikelog'
  location: location
  properties: {
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

var keyVaultSecret = '${vault.properties.vaultUri}secrets/'

var settings = {
  environmentId: environment.id
  identityId: appIdentity.id
  identityClientId: appIdentity.properties.clientId
  keyVaultSecret: keyVaultSecret
  auth0Issuer: auth0Issuer
  auth0Audience: auth0Audience
}

module app 'modules/containerApp.bicep' = {
  name: 'containerApp'
  params: {
    location: location
    settings: settings
    publicOrigin: 'https://ca-bikelog.${environment.properties.defaultDomain}'
    webImage: webImage
    apiImage: apiImage
    auth0ClientId: auth0ClientId
    allowedIngressCidrs: allowedIngressCidrs
  }
}

module jobs 'modules/jobs.bicep' = {
  name: 'jobs'
  params: {
    location: location
    settings: settings
    apiImage: apiImage
    migrationsImage: migrationsImage
    backupImage: backupImage
    aivenDatabaseHost: aivenDatabaseHost
    backupAccountUrl: 'https://${storage.name}.blob.${az.environment().suffixes.storage}'
  }
}

module alerts 'modules/alerts.bicep' = {
  name: 'alerts'
  params: {
    ownerAlertEmail: ownerAlertEmail
    appId: app.outputs.id
    backupJobId: jobs.outputs.backupJobId
  }
}

output fqdn string = app.outputs.fqdn
