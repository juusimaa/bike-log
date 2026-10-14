// Every environment-specific value comes from an environment variable, so nothing
// tenant-specific is committed. The deploy workflow sets them from the GitHub
// environment `production` (contracts/operations.md):
//   OWNER_ALERT_EMAIL, AIVEN_DATABASE_HOST, AUTH0_ISSUER, AUTH0_AUDIENCE,
//   AUTH0_CLIENT_ID, INGRESS_ALLOW_CIDRS (comma-separated; empty opens the app)
// and from the images it resolved for the commit:
//   WEB_IMAGE, API_IMAGE, MIGRATIONS_IMAGE, BACKUP_IMAGE (ghcr.io/...@sha256:...)
using 'main.bicep'

param webImage = readEnvironmentVariable('WEB_IMAGE')
param apiImage = readEnvironmentVariable('API_IMAGE')
param migrationsImage = readEnvironmentVariable('MIGRATIONS_IMAGE')
param backupImage = readEnvironmentVariable('BACKUP_IMAGE')

param auth0Issuer = readEnvironmentVariable('AUTH0_ISSUER')
param auth0Audience = readEnvironmentVariable('AUTH0_AUDIENCE')
param auth0ClientId = readEnvironmentVariable('AUTH0_CLIENT_ID')
param aivenDatabaseHost = readEnvironmentVariable('AIVEN_DATABASE_HOST')
param ownerAlertEmail = readEnvironmentVariable('OWNER_ALERT_EMAIL')

param allowedIngressCidrs = filter(
  map(split(readEnvironmentVariable('INGRESS_ALLOW_CIDRS', ''), ','), cidr => trim(cidr)),
  cidr => !empty(cidr)
)
