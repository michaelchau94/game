import { memo } from 'react'
import { Activity, Box, Boxes, Braces, Database, GitBranch, Globe2, Radio, ShieldCheck, Server, Zap, type LucideIcon } from 'lucide-react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { DiagramNode, NodeKind } from '../types'

const icons: Record<NodeKind, LucideIcon> = {
  traffic: Activity,
  gateway: Globe2,
  service: Boxes,
  database: Database,
  cache: Zap,
  broker: Radio,
  circuitBreaker: ShieldCheck,
  pipeline: GitBranch,
  cluster: Server,
}

const eyebrow: Record<NodeKind, string> = {
  traffic: 'LOAD INJECTOR',
  gateway: 'EDGE ROUTING',
  service: 'MICROSERVICE',
  database: 'PERSISTENCE',
  cache: 'IN-MEMORY',
  broker: 'EVENT STREAM',
  circuitBreaker: 'RESILIENCE',
  pipeline: 'DELIVERY',
  cluster: 'COMPUTE',
}

function ServiceNodeView({ data, selected }: NodeProps<DiagramNode>) {
  const Icon = icons[data.kind] || Box
  const health = data.health || 'idle'
  const capacityLabel = data.kind === 'pipeline' ? '5 stages' : data.kind === 'traffic' ? `${(data.capacity / 1000).toFixed(1)}k RPS` : `${data.capacity.toLocaleString()} RPS`

  return (
    <div className={`service-node node-${data.kind} health-${health}${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} isConnectable className="node-handle" aria-label="Input port. Connect an output port here." title="Input · connect an output port here" />
      <div className="node-topline">
        <span className="node-icon"><Icon size={15} strokeWidth={1.8} /></span>
        <span className="node-eyebrow">{eyebrow[data.kind]}</span>
        <span className={`health-dot health-dot--${health}`} title={health} />
      </div>
      <div className="node-name">{data.label}</div>
      <div className="node-bottomline">
        <span>{data.latency} ms</span>
        <span className="node-divider" />
        <span>{capacityLabel}</span>
      </div>
      {data.kind === 'pipeline' ? <span className="pipeline-mark"><Braces size={12} /></span> : null}
      <Handle type="source" position={Position.Right} isConnectable className="node-handle" aria-label="Output port. Drag to another node's input port." title="Output · drag to another node's input port" />
    </div>
  )
}

export default memo(ServiceNodeView)
