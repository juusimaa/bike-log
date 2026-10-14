// Migration, operator and backup jobs (research D7, D8, D9). Every job uses the app
// identity, Key Vault secret references and the CA certificate mounted at /mnt/secrets.
param location string
param settings object
param apiImage string
param migrationsImage string
param backupImage string
param aivenDatabaseHost string
param backupAccountUrl string

var identity = {
  type: 'UserAssigned'
  userAssignedIdentities: {
    '${settings.identityId}': {}
  }
}
var secretVolume = {
  name: 'secrets'
  storageType: 'Secret'
  secrets: [
    {
      secretRef: 'aiven-ca-certificate'
      path: 'aiven-ca-certificate'
    }
  ]
}
var secretMount = {
  volumeName: 'secrets'
  mountPath: '/mnt/secrets'
}
var resources = {
  cpu: json('0.25')
  memory: '0.5Gi'
}
func secret(keyVaultSecret string, identityId string, name string) object => {
  name: name
  keyVaultUrl: '${keyVaultSecret}${name}'
  identity: identityId
}
var manual = {
  parallelism: 1
  replicaCompletionCount: 1
}

resource migrate 'Microsoft.App/jobs@2026-07-01' = {
  name: 'job-bikelog-migrate'
  location: location
  identity: identity
  properties: {
    environmentId: settings.environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      manualTriggerConfig: manual
      replicaTimeout: 600
      replicaRetryLimit: 0
      secrets: [
        secret(settings.keyVaultSecret, settings.identityId, 'api-postgres-connection')
        secret(settings.keyVaultSecret, settings.identityId, 'aiven-ca-certificate')
      ]
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: migrationsImage
          resources: resources
          env: [
            { name: 'ConnectionStrings__Postgres', secretRef: 'api-postgres-connection' }
          ]
          volumeMounts: [secretMount]
        }
      ]
      volumes: [secretVolume]
    }
  }
}

// Arguments are set per run by scripts/hosted/hosted.sh, which restores --help afterwards.
// Each deployment also resets them to --help.
resource ops 'Microsoft.App/jobs@2026-07-01' = {
  name: 'job-bikelog-ops'
  location: location
  identity: identity
  properties: {
    environmentId: settings.environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      manualTriggerConfig: manual
      replicaTimeout: 120
      replicaRetryLimit: 0
      secrets: [
        secret(settings.keyVaultSecret, settings.identityId, 'api-postgres-connection')
        secret(settings.keyVaultSecret, settings.identityId, 'aiven-ca-certificate')
      ]
    }
    template: {
      containers: [
        {
          name: 'ops'
          image: apiImage
          args: ['--help']
          resources: resources
          env: [
            { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
            { name: 'ASPNETCORE_URLS', value: 'http://127.0.0.1:5080' }
            { name: 'AccessMode', value: 'Authenticated' }
            { name: 'LocalSyntheticMode', value: 'false' }
            { name: 'Auth__Issuer', value: settings.auth0Issuer }
            { name: 'Auth__Audience', value: settings.auth0Audience }
            { name: 'Auth__Scope', value: 'BikeLog.Access' }
            { name: 'ConnectionStrings__Postgres', secretRef: 'api-postgres-connection' }
            { name: 'Operator__HostedDatabaseHost', value: aivenDatabaseHost }
          ]
          volumeMounts: [secretMount]
        }
      ]
      volumes: [secretVolume]
    }
  }
}

resource backup 'Microsoft.App/jobs@2026-07-01' = {
  name: 'job-bikelog-backup'
  location: location
  identity: identity
  properties: {
    environmentId: settings.environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Schedule'
      // 02:30 UTC daily. The daily connection also keeps the free Aiven service awake.
      scheduleTriggerConfig: {
        cronExpression: '30 2 * * *'
        parallelism: 1
        replicaCompletionCount: 1
      }
      replicaTimeout: 900
      replicaRetryLimit: 1
      secrets: [
        secret(settings.keyVaultSecret, settings.identityId, 'backup-database-url')
        secret(settings.keyVaultSecret, settings.identityId, 'aiven-ca-certificate')
      ]
    }
    template: {
      containers: [
        {
          name: 'backup'
          image: backupImage
          resources: resources
          env: [
            { name: 'BIKELOG_DATABASE_URL', secretRef: 'backup-database-url' }
            { name: 'BACKUP_ACCOUNT_URL', value: backupAccountUrl }
            { name: 'BACKUP_CONTAINER', value: 'backups' }
            // Selects the user-assigned identity at the managed identity endpoint.
            { name: 'AZURE_CLIENT_ID', value: settings.identityClientId }
          ]
          volumeMounts: [secretMount]
        }
      ]
      volumes: [secretVolume]
    }
  }
}

output backupJobId string = backup.id
