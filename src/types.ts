import type { Edge, Node } from '@xyflow/react'

export type NodeKind = 'traffic' | 'gateway' | 'service' | 'database' | 'cache' | 'broker' | 'circuitBreaker' | 'pipeline' | 'cluster'
export type Health = 'healthy' | 'degraded' | 'crashed' | 'idle'
export type Protocol = 'HTTP' | 'gRPC' | 'AMQP' | 'SQL'

export type DiagramNodeData = {
  label: string
  kind: NodeKind
  capacity: number
  latency: number
  health?: Health
  description?: string
}

export type DiagramNode = Node<DiagramNodeData, 'service'>
export type DiagramEdge = Edge<{ protocol: Protocol }, 'smoothstep'>

export type MetricPoint = {
  second: number
  incomingRps: number
  throughput: number
  errorRate: number
  p95: number
  uptime: number
  cpu: number
}

export type AntiPattern = {
  id: string
  severity: 'critical' | 'warning'
  title: string
  detail: string
}

export type FourDReviewItem = {
  dimension: string
  status: string
  detail: string
}

export type SimulationResult = {
  outcome: 'pass' | 'conditional' | 'fail'
  crashed: boolean
  peak: MetricPoint
  timeline: MetricPoint[]
  antiPatterns: AntiPattern[]
  fourDReview: FourDReviewItem[]
  summary: string
  reflection: string
  xp: number
}

export type PipelineStage = {
  id: string
  name: string
  shortName: string
  enabled: boolean
  blocking: boolean
  note: string
  order: number
}

export type PipelineLog = {
  stage: string
  status: string
  message: string
}

export type PipelineResult = {
  outcome: 'protected' | 'recovered' | 'failed' | 'blocked'
  deployed: boolean
  productionImpacted: boolean
  rolledBack: boolean
  logs: PipelineLog[]
  message: string
}
