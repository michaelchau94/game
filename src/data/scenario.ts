import type { DiagramEdge, DiagramNode, PipelineStage } from '../types'

export const initialNodes: DiagramNode[] = [
  { id: 'traffic', type: 'service', position: { x: 34, y: 190 }, data: { kind: 'traffic', label: 'Flash sale', capacity: 5000, latency: 8, health: 'idle', description: 'Traffic generator · 200 → 3k RPS' } },
  { id: 'gateway', type: 'service', position: { x: 254, y: 190 }, data: { kind: 'gateway', label: 'API Gateway', capacity: 3600, latency: 18, health: 'idle', description: 'Public edge · rate limiting off' } },
  { id: 'checkout', type: 'service', position: { x: 484, y: 72 }, data: { kind: 'service', label: 'Checkout', capacity: 2400, latency: 34, health: 'idle', description: 'Order orchestration · synchronous' } },
  { id: 'inventory', type: 'service', position: { x: 484, y: 278 }, data: { kind: 'service', label: 'Inventory', capacity: 1800, latency: 42, health: 'idle', description: 'Stock reservation · synchronous' } },
  { id: 'payments', type: 'service', position: { x: 714, y: 190 }, data: { kind: 'service', label: 'Payments', capacity: 1600, latency: 60, health: 'idle', description: 'Payment authorization · synchronous' } },
  { id: 'database', type: 'service', position: { x: 936, y: 190 }, data: { kind: 'database', label: 'Primary DB', capacity: 1200, latency: 28, health: 'idle', description: 'Shared Postgres · single instance' } },
]

export const initialEdges: DiagramEdge[] = [
  { id: 'e-traffic-gateway', source: 'traffic', target: 'gateway', type: 'smoothstep', animated: false, label: 'HTTP', data: { protocol: 'HTTP' } },
  { id: 'e-gateway-checkout', source: 'gateway', target: 'checkout', type: 'smoothstep', animated: false, label: 'HTTP', data: { protocol: 'HTTP' } },
  { id: 'e-checkout-inventory', source: 'checkout', target: 'inventory', type: 'smoothstep', animated: false, label: 'gRPC', data: { protocol: 'gRPC' } },
  { id: 'e-checkout-payments', source: 'checkout', target: 'payments', type: 'smoothstep', animated: false, label: 'HTTP', data: { protocol: 'HTTP' } },
  { id: 'e-checkout-db', source: 'checkout', target: 'database', type: 'smoothstep', animated: false, label: 'SQL', data: { protocol: 'SQL' } },
  { id: 'e-inventory-db', source: 'inventory', target: 'database', type: 'smoothstep', animated: false, label: 'SQL', data: { protocol: 'SQL' } },
  { id: 'e-payments-db', source: 'payments', target: 'database', type: 'smoothstep', animated: false, label: 'SQL', data: { protocol: 'SQL' } },
]

export const defaultPipeline: PipelineStage[] = [
  { id: 'lint', name: 'Code linting', shortName: 'Lint', enabled: true, blocking: true, note: 'Formatting + static analysis', order: 1 },
  { id: 'tests', name: 'Unit & integration tests', shortName: 'Tests', enabled: true, blocking: true, note: 'Regression suite · 124 checks', order: 2 },
  { id: 'build', name: 'Container build', shortName: 'Build', enabled: true, blocking: true, note: 'Build immutable image', order: 3 },
  { id: 'security', name: 'Security scan', shortName: 'Scan', enabled: true, blocking: false, note: 'Dependency CVE check', order: 4 },
  { id: 'deploy', name: 'Deployment strategy', shortName: 'Deploy', enabled: true, blocking: true, note: 'Canary · 10% traffic', order: 5 },
]

export const moduleInfo = {
  monolith: {
    number: '01', title: 'Monolith decomposition', shortTitle: 'Flash-sale checkout', focus: 'Untangle the checkout path before the next traffic spike.',
    objective: 'Split the shared persistence boundary and absorb read traffic before the flash sale begins.', incident: 'At 12:04 UTC, a 15× traffic spike saturated the shared checkout database. Inventory writes stalled and payment requests cascaded into timeouts.',
  },
  data: {
    number: '02', title: 'Distributed data', shortTitle: 'The stale inventory problem', focus: 'Balance consistency, availability, and latency across regions.',
    objective: 'Keep checkout available during a regional database partition without overselling inventory.', incident: 'A replica lagged by 8 seconds during a regional failover. Checkout stayed online, but customers bought items that were already out of stock.',
  },
  devops: {
    number: '03', title: 'DevOps automation', shortTitle: 'Safe release pipeline', focus: 'Catch the memory leak before it reaches production.',
    objective: 'Build a blocking quality gate and a canary rollback path for a risky checkout hotfix.', incident: 'A memory leak slipped through a manual release. The new checkout build exhausted the production cluster within minutes.',
  },
  agents: {
    number: '04', title: 'Multi-agent oversight', shortTitle: 'Human-in-the-loop delivery', focus: 'Delegate safely while keeping a human accountable for release decisions.',
    objective: 'Coordinate specialized coding, testing, and security agents with explicit review gates.', incident: 'Three autonomous agents merged conflicting changes. No owner verified the deployment plan before release.',
  },
} as const
