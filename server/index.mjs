import cors from 'cors'
import express from 'express'

const app = express()
const port = Number(process.env.PORT || 4000)

app.use(cors())
app.use(express.json({ limit: '1mb' }))

const nodeKind = (node) => node?.data?.kind || node?.type || 'service'
const value = (number, fallback) => Number.isFinite(Number(number)) ? Number(number) : fallback

function inspectGraph(graph = {}) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const kindOf = (id) => nodeKind(byId.get(id))
  const services = nodes.filter((node) => ['service', 'gateway', 'worker'].includes(nodeKind(node)))
  const databaseSources = new Set(
    edges.filter((edge) => kindOf(edge.target) === 'database' && ['service', 'gateway', 'worker'].includes(kindOf(edge.source))).map((edge) => edge.source),
  )
  const databases = nodes.filter((node) => nodeKind(node) === 'database')
  const databaseConsumers = new Map()
  for (const edge of edges) if (kindOf(edge.target) === 'database') {
    databaseConsumers.set(edge.target, [...(databaseConsumers.get(edge.target) || []), edge.source])
  }
  const dataServices = nodes.filter((node) => nodeKind(node) === 'service')
  const missingPersistence = dataServices.filter((service) => !databaseSources.has(service.id))
  const caches = nodes.filter((node) => nodeKind(node) === 'cache')
  const cacheConnected = caches.some((cache) => edges.some((edge) => edge.target === cache.id) && edges.some((edge) => edge.source === cache.id))
  const hasCircuitBreaker = nodes.some((node) => nodeKind(node) === 'circuitBreaker' && edges.some((edge) => edge.source === node.id || edge.target === node.id))
  const sharedDatabase = [...databaseConsumers.values()].some((consumers) => new Set(consumers).size > 1) || (databaseSources.size > 1 && databases.length < databaseSources.size)

  let longestSyncChain = 0
  const adjacency = new Map()
  for (const edge of edges) {
    if (edge?.data?.protocol === 'AMQP' || edge?.label === 'AMQP') continue
    if (!['service', 'gateway', 'worker'].includes(kindOf(edge.source)) || !['service', 'gateway', 'worker'].includes(kindOf(edge.target))) continue
    adjacency.set(edge.source, [...(adjacency.get(edge.source) || []), edge.target])
  }
  const walk = (id, seen, depth) => {
    longestSyncChain = Math.max(longestSyncChain, depth)
    if (depth >= 8) return
    for (const next of adjacency.get(id) || []) if (!seen.has(next)) walk(next, new Set([...seen, next]), depth + 1)
  }
  for (const service of services) walk(service.id, new Set([service.id]), 1)

  const antiPatterns = []
  if (sharedDatabase) {
    antiPatterns.push({ id: 'shared-database', severity: 'critical', title: 'Shared database coupling', detail: `${databaseSources.size} services write through the same database boundary.` })
  }
  if (missingPersistence.length) {
    antiPatterns.push({ id: 'missing-persistence', severity: 'critical', title: 'Service has no owned database', detail: `${missingPersistence.length} service${missingPersistence.length === 1 ? '' : 's'} ${missingPersistence.length === 1 ? 'has' : 'have'} no database connection.` })
  }
  if (services.length > 1 && !cacheConnected) {
    antiPatterns.push({ id: 'uncached-reads', severity: 'warning', title: 'Hot reads bypass cache', detail: 'Read-heavy traffic has no connected cache layer to absorb the flash-sale surge.' })
  }
  if (longestSyncChain > 3 && !hasCircuitBreaker) {
    antiPatterns.push({ id: 'sync-cascade', severity: 'critical', title: 'Unprotected synchronous cascade', detail: `A synchronous call path reaches ${longestSyncChain} services without a circuit breaker.` })
  }
  if (databases.length === 1) {
    antiPatterns.push({ id: 'single-point-of-failure', severity: 'warning', title: 'Database is a single point of failure', detail: 'Add a replica or split data ownership to reduce the blast radius.' })
  }

  return { antiPatterns, hasCache: cacheConnected, hasCircuitBreaker, longestSyncChain, databases, services, databaseSources, sharedDatabase, missingPersistence }
}

app.get('/api/health', (_request, response) => response.json({ status: 'ok', service: 'simengine-simulation-api' }))

app.post('/api/validate', (request, response) => {
  response.json(inspectGraph(request.body || {}))
})

app.post('/api/simulate', (request, response) => {
  const { nodes = [], edges = [] } = request.body?.graph || {}
  const audit = inspectGraph({ nodes, edges })
  const roots = nodes.filter((node) => nodeKind(node) === 'traffic')
  const fallbackRoots = roots.length ? roots : nodes.filter((node) => !edges.some((edge) => edge.target === node.id))
  const reachable = new Set(fallbackRoots.map((node) => node.id))
  const queue = [...reachable]
  while (queue.length) {
    const current = queue.shift()
    for (const edge of edges) if (edge.source === current && !reachable.has(edge.target)) {
      reachable.add(edge.target)
      queue.push(edge.target)
    }
  }
  const activeNodes = nodes.filter((node) => reachable.has(node.id))
  const activeDatabases = activeNodes.filter((node) => nodeKind(node) === 'database')
  const activeServices = activeNodes.filter((node) => ['gateway', 'service', 'worker', 'cluster'].includes(nodeKind(node)))
  const dbCapacity = Math.max(250, activeDatabases.length ? Math.min(...activeDatabases.map((node) => value(node.data?.capacity, 1200))) : 1200)
  const serviceCapacity = activeServices.length ? Math.min(...activeServices.map((node) => value(node.data?.capacity, 1800))) : 3000
  const hasCache = audit.hasCache && activeNodes.some((node) => nodeKind(node) === 'cache')
  const topologyPenalty = (audit.sharedDatabase ? 1.15 : 0) + (!hasCache ? 1.05 : 0) + (audit.longestSyncChain > 3 && !audit.hasCircuitBreaker ? 1.25 : 0)
  const timeline = []

  for (let second = 0; second <= 30; second += 1) {
    const incomingRps = Math.round(200 + (2800 * second) / 30)
    const cacheHitRate = hasCache ? 0.7 : 0.08
    const dbDemand = incomingRps * (0.72 * (1 - cacheHitRate) + 0.12)
    const dbUtilization = dbDemand / dbCapacity
    const serviceUtilization = incomingRps / serviceCapacity
    const peakUtilization = Math.max(dbUtilization, serviceUtilization)
    const saturationError = Math.max(0, (peakUtilization - 0.78) * 6.4)
    const errorRate = Math.min(99, Number((saturationError + topologyPenalty).toFixed(2)))
    const p95 = Math.round(58 + peakUtilization * 112 + errorRate * 29 + (audit.sharedDatabase ? 54 : 0))
    const uptime = Number(Math.max(90, 99.96 - errorRate * 0.17 - (errorRate > 5 ? 0.65 : 0)).toFixed(2))
    const throughput = Math.round(Math.min(incomingRps, serviceCapacity, dbCapacity / (0.72 * (1 - cacheHitRate) + 0.12)))
    timeline.push({ second, incomingRps, throughput, errorRate, p95, uptime, cpu: Math.min(100, Math.round(peakUtilization * 68)) })
  }

  const peak = timeline[timeline.length - 1]
  const criticalCount = audit.antiPatterns.filter((pattern) => pattern.severity === 'critical').length
  const telemetryPass = peak.errorRate < 1 && peak.p95 <= 300 && peak.uptime >= 99
  const outcome = !telemetryPass || criticalCount > 0 ? 'fail' : audit.antiPatterns.length ? 'conditional' : 'pass'
  const crashed = peak.errorRate > 5 || peak.cpu >= 100
  const fourDReview = [
    { dimension: 'Decomposition', status: audit.sharedDatabase || audit.missingPersistence.length ? 'Needs work' : 'Sound', detail: audit.sharedDatabase ? 'Services still share a persistence boundary.' : audit.missingPersistence.length ? 'Every service needs its own database connection.' : 'Service boundaries are independently deployable.' },
    { dimension: 'Resilience', status: audit.longestSyncChain > 3 && !audit.hasCircuitBreaker ? 'Needs work' : 'Protected', detail: audit.longestSyncChain > 3 && !audit.hasCircuitBreaker ? 'Long synchronous chains amplify downstream failures.' : 'Failure paths have bounded depth or a breaker.' },
    { dimension: 'Data & scale', status: hasCache ? 'Optimized' : 'Needs work', detail: hasCache ? 'A connected cache absorbs the hot-read workload.' : 'Hot reads still compete with writes for database capacity.' },
    { dimension: 'Delivery', status: nodes.some((node) => nodeKind(node) === 'pipeline') ? 'Configured' : 'Next step', detail: nodes.some((node) => nodeKind(node) === 'pipeline') ? 'A release workflow is represented in the design.' : 'Add automated test and rollback gates in the CI/CD lab.' },
  ]

  response.json({
    outcome,
    crashed,
    peak,
    timeline,
    antiPatterns: audit.antiPatterns,
    fourDReview,
    summary: outcome === 'pass'
      ? 'All hard gates are green. The architecture is resilient under flash-sale traffic.'
      : outcome === 'conditional'
        ? 'SLAs held, but the topology still carries efficiency risks worth addressing.'
        : 'Peak traffic exceeded one or more hard gates. Refactor the bottleneck and retry.',
    reflection: outcome === 'fail'
      ? 'Which dependency became the bottleneck first, and how could you reduce its blast radius?'
      : 'What is the smallest change that would make this design easier to scale independently?',
    xp: outcome === 'pass' ? 350 : outcome === 'conditional' ? 220 : 0,
  })
})

app.post('/api/pipeline', (request, response) => {
  const { stages = [], strategy = 'canary', canaryTraffic = 10, rollbackThreshold = 2, rollbackEnabled = true } = request.body || {}
  const logs = [{ stage: 'Git push', status: 'complete', message: 'flash-sale-hotfix · memory leak injected' }]
  const enabledStages = stages.filter((stage) => stage.enabled !== false).sort((a, b) => a.order - b.order)
  const tests = enabledStages.find((stage) => stage.id === 'tests')
  const deployment = enabledStages.find((stage) => stage.id === 'deploy')
  const testStage = enabledStages.find((stage) => stage.id === 'tests')

  for (const stage of enabledStages) {
    if (stage.id === 'tests' && testStage && testStage.blocking !== false) {
      logs.push({ stage: stage.name, status: 'blocked', message: 'Regression detected: heap usage grows by 42% under checkout load. Deployment halted.' })
      return response.json({ outcome: 'protected', deployed: false, productionImpacted: false, rolledBack: false, logs, message: 'Blocking tests caught the regression before it reached production.' })
    }
    logs.push({ stage: stage.name, status: stage.id === 'tests' ? 'warning' : 'complete', message: stage.id === 'tests' ? 'Tests skipped or non-blocking; regression may reach production.' : `${stage.name} passed.` })
  }

  if (!deployment) {
    logs.push({ stage: 'Deployment', status: 'blocked', message: 'No deployment stage is enabled.' })
    return response.json({ outcome: 'blocked', deployed: false, productionImpacted: false, rolledBack: false, logs, message: 'Add an enabled deployment stage to finish the pipeline.' })
  }

  if (strategy === 'canary' && rollbackEnabled && Number(canaryTraffic) < 100 && Number(rollbackThreshold) <= 8) {
    logs.push({ stage: 'Canary rollout', status: 'complete', message: `${canaryTraffic}% traffic routed to the new build.` })
    logs.push({ stage: 'Telemetry gate', status: 'warning', message: `Canary error rate 8.4% exceeded the ${rollbackThreshold}% rollback threshold.` })
    logs.push({ stage: 'Automated rollback', status: 'recovered', message: 'Traffic restored to stable build. Customer impact avoided.' })
    return response.json({ outcome: 'recovered', deployed: false, productionImpacted: false, rolledBack: true, logs, message: 'Canary monitoring detected the memory leak and rolled back automatically.' })
  }

  logs.push({ stage: 'Production rollout', status: 'failed', message: strategy === 'blue-green' ? 'Buggy build switched live; heap growth exhausted the production cluster.' : 'Canary threshold did not trigger an automated rollback.' })
  return response.json({ outcome: 'failed', deployed: true, productionImpacted: true, rolledBack: false, logs, message: 'The regression reached production. Add a blocking test gate or tighten your canary rollback policy.' })
})

app.listen(port, () => console.log(`SimEngine API listening on http://localhost:${port}`))
