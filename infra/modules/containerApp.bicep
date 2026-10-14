// ca-bikelog: web and api in one replica, sharing localhost (research D2).
// Settings follow specs/004-hosted-deployment/contracts/hosted-configuration.md.
param location string
param settings object
param publicOrigin string
param webImage string
param apiImage string
param auth0ClientId string
param allowedIngressCidrs array

var secretNames = [
  'api-postgres-connection'
  'web-database-url'
  'web-session-key'
  'auth0-client-secret'
  'aiven-ca-certificate'
]

// Only the public CA certificate is a file; other secrets are environment variables.
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
var ipRules = [
  for (cidr, i) in allowedIngressCidrs: {
    name: 'owner-${i}'
    action: 'Allow'
    ipAddressRange: cidr
  }
]
var secretMount = {
  volumeName: 'secrets'
  mountPath: '/mnt/secrets'
}

resource app 'Microsoft.App/containerApps@2026-07-01' = {
  name: 'ca-bikelog'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${settings.identityId}': {}
    }
  }
  properties: {
    environmentId: settings.environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: union(
        {
          external: true
          targetPort: 3000
          allowInsecure: false
          transport: 'auto'
          traffic: [
            {
              latestRevision: true
              weight: 100
            }
          ]
        },
        empty(allowedIngressCidrs)
          ? {}
          : { ipSecurityRestrictions: ipRules }
      )
      // Versionless references: a new secret version rolls out within 30 minutes.
      secrets: [
        for secret in secretNames: {
          name: secret
          keyVaultUrl: '${settings.keyVaultSecret}${secret}'
          identity: settings.identityId
        }
      ]
    }
    template: {
      // web is listed first: the platform's default probes target the ingress container.
      containers: [
        {
          name: 'web'
          image: webImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            // Bind on all interfaces even though the platform sets HOSTNAME to the replica name.
            { name: 'HOSTNAME', value: '0.0.0.0' }
            { name: 'PORT', value: '3000' }
            { name: 'BIKELOG_WEB_ACCESS_MODE', value: 'Authenticated' }
            { name: 'WEB_PUBLIC_ORIGIN', value: publicOrigin }
            { name: 'BIKELOG_API_ORIGIN', value: 'http://127.0.0.1:5080' }
            { name: 'AUTH0_ISSUER', value: settings.auth0Issuer }
            { name: 'AUTH0_AUDIENCE', value: settings.auth0Audience }
            { name: 'AUTH0_CLIENT_ID', value: auth0ClientId }
            { name: 'AUTH0_CLIENT_SECRET', secretRef: 'auth0-client-secret' }
            { name: 'BIKELOG_WEB_DATABASE_URL', secretRef: 'web-database-url' }
            { name: 'BIKELOG_DATABASE_CA_FILE', value: '/mnt/secrets/aiven-ca-certificate' }
            { name: 'BIKELOG_SESSION_KEY', secretRef: 'web-session-key' }
          ]
          volumeMounts: [secretMount]
          // /healthz succeeds only when the API answers /health/ready over loopback, so
          // these probes also cover the api container.
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/healthz'
                port: 3000
              }
              periodSeconds: 5
              failureThreshold: 12
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/healthz'
                port: 3000
              }
              periodSeconds: 10
            }
            {
              type: 'Liveness'
              tcpSocket: {
                port: 3000
              }
              periodSeconds: 30
            }
          ]
        }
        {
          // Bound to 127.0.0.1, so platform HTTP probes (sent to the replica IP) cannot
          // reach it; it has none, and web's /healthz checks it instead.
          name: 'api'
          image: apiImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
            { name: 'ASPNETCORE_URLS', value: 'http://127.0.0.1:5080' }
            { name: 'AccessMode', value: 'Authenticated' }
            { name: 'LocalSyntheticMode', value: 'false' }
            { name: 'Auth__Issuer', value: settings.auth0Issuer }
            { name: 'Auth__Audience', value: settings.auth0Audience }
            { name: 'Auth__Scope', value: 'BikeLog.Access' }
            { name: 'ConnectionStrings__Postgres', secretRef: 'api-postgres-connection' }
          ]
          volumeMounts: [secretMount]
        }
      ]
      volumes: [secretVolume]
      // One replica keeps database connections within Aiven's free limit (research D11).
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
}

output id string = app.id
output fqdn string = app.properties.configuration.ingress.fqdn
