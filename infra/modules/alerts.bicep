// Email the owner when a day passes without a successful backup, or the app keeps
// restarting (research D10).
param ownerAlertEmail string
param appId string
param backupJobId string

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

// Fires for both failed and missed runs: it counts only succeeded executions.
// The `state` dimension value was taken from the Microsoft.App/jobs metric reference;
// confirm it in the portal at setup (tasks.md T040).
resource backupMissing 'Microsoft.Insights/metricAlerts@2026-01-01' = {
  name: 'alert-backup-missing'
  location: 'global'
  properties: {
    description: 'No successful Bike Log backup in the last 24 hours.'
    severity: 2
    enabled: true
    scopes: [backupJobId]
    evaluationFrequency: 'PT1H'
    windowSize: 'P1D'
    targetResourceType: 'Microsoft.App/jobs'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'succeeded-executions'
          metricNamespace: 'Microsoft.App/jobs'
          metricName: 'Executions'
          dimensions: [
            {
              name: 'state'
              operator: 'Include'
              values: ['Succeeded']
            }
          ]
          operator: 'LessThan'
          threshold: 1
          timeAggregation: 'Total'
          skipMetricValidation: true
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

resource appRestarts 'Microsoft.Insights/metricAlerts@2026-01-01' = {
  name: 'alert-app-restarts'
  location: 'global'
  properties: {
    description: 'Bike Log restarted more than 3 times in an hour.'
    severity: 2
    enabled: true
    scopes: [appId]
    evaluationFrequency: 'PT15M'
    windowSize: 'PT1H'
    targetResourceType: 'Microsoft.App/containerApps'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'restarts'
          metricNamespace: 'Microsoft.App/containerApps'
          metricName: 'RestartCount'
          operator: 'GreaterThan'
          threshold: 3
          timeAggregation: 'Maximum'
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
