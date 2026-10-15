import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Code2,
  Cpu,
  Database,
  GitBranch,
  Globe2,
  Layers3,
  LockKeyhole,
  Minus,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trash2,
  TrendingUp,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { moduleInfo } from './data/scenario'
import MetricCard from './components/MetricCard'
import ServiceNode from './components/ServiceNode'
import { useSimulatorStore } from './store/useSimulatorStore'
import type { AntiPattern, DiagramEdge, DiagramNode, MetricPoint, NodeKind, PipelineResult, Protocol, SimulationResult } from './types'
import '@xyflow/react/dist/style.css'
import './App.css'

const nodeTypes = { service: ServiceNode }
const starterMetric: MetricPoint = { second: 0, incomingRps: 1240, throughput: 1180, errorRate: 0.4, p95: 96, uptime: 99.95, cpu: 34 }
const kindIcon: Record<NodeKind, LucideIcon> = { traffic: Activity, gateway: Globe2, service: Boxes, database: Database, cache: Zap, broker: Radio, circuitBreaker: ShieldCheck, pipeline: GitBranch, cluster: Layers3 }
const kindTitle: Record<NodeKind, string> = { traffic: 'Traffic source', gateway: 'API gateway', service: 'Microservice', database: 'Database', cache: 'Cache', broker: 'Message broker', circuitBreaker: 'Circuit breaker', pipeline: 'CI/CD pipeline', cluster: 'Production cluster' }
const palette: { kind: NodeKind; label: string; icon: LucideIcon }[] = [
  { kind: 'service', label: 'Service', icon: Boxes },
  { kind: 'database', label: 'Database', icon: Database },
  { kind: 'cache', label: 'Cache', icon: Zap },
  { kind: 'broker', label: 'Broker', icon: Radio },
  { kind: 'circuitBreaker', label: 'Breaker', icon: ShieldCheck },
  { kind: 'pipeline', label: 'CI/CD', icon: GitBranch },
]

function App() {
  return <ReactFlowProvider><Simulator /></ReactFlowProvider>
}

function Simulator() {
  const flow = useReactFlow<DiagramNode, DiagramEdge>()
  const store = useSimulatorStore()
  const [audit, setAudit] = useState<{ antiPatterns: AntiPattern[]; longestSyncChain?: number }>({ antiPatterns: [] })
  const [auditReady, setAuditReady] = useState(false)
  const [metricHistory, setMetricHistory] = useState<MetricPoint[]>([])
  const [toast, setToast] = useState('')
  const [filterText, setFilterText] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [agentReviewApproved, setAgentReviewApproved] = useState(false)
  const [showBeginnerGuide, setShowBeginnerGuide] = useState(() => {
    try { return window.localStorage.getItem('simengine-guide-dismissed') !== 'true' } catch { return true }
  })
  const module = moduleInfo[store.activeModule]
  const metric = store.currentMetric || starterMetric
  const nodes = store.nodes
  const edges = store.edges
  const agentGraphRevision = JSON.stringify({
    nodes: nodes.map((node) => [node.id, node.position.x, node.position.y, node.data.kind, node.data.label, node.data.capacity, node.data.latency]),
    edges: edges.map((edge) => [edge.id, edge.source, edge.target, edge.data?.protocol]),
  })
  const previousAgentGraphRevision = useRef('')
  const selectedNode = nodes.find((node) => node.id === store.selectedNodeId)
  const selectedEdge = edges.find((edge) => edge.id === store.selectedEdgeId)
  const visibleHistory = metricHistory.length ? metricHistory.slice(-18) : Array.from({ length: 12 }, (_, index) => ({ ...starterMetric, second: index * 2, incomingRps: 800 + index * 18, throughput: 760 + index * 16, p95: 88 + index, cpu: 30 + index }))
  const isPipelineView = store.canvasTab === 'pipeline'

  useEffect(() => {
    fetch('/api/health').then((response) => response.ok ? response.json() : Promise.reject()).then(() => store.setApiOnline(true)).catch(() => store.setApiOnline(false))
  }, [store.setApiOnline])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges }),
      })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((data) => { setAudit(data); setAuditReady(true) })
        .catch(() => { setAuditReady(false); store.setApiOnline(false) })
    }, 280)
    return () => window.clearTimeout(timeout)
  }, [nodes, edges, store.setApiOnline])

  useEffect(() => {
    if (previousAgentGraphRevision.current && previousAgentGraphRevision.current !== agentGraphRevision) setAgentReviewApproved(false)
    previousAgentGraphRevision.current = agentGraphRevision
  }, [agentGraphRevision])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        document.querySelector<HTMLButtonElement>('.run-button')?.click()
      }
      if (event.key === 'Escape') setShowHelp(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const addCanvasNode = useCallback((kind: NodeKind) => {
    const existingPipeline = kind === 'pipeline' ? useSimulatorStore.getState().nodes.find((node) => node.data.kind === 'pipeline') : undefined
    if (existingPipeline) {
      store.selectNode(existingPipeline.id)
      store.setCanvasTab('pipeline')
      return
    }
    const canvas = document.querySelector('.flow-canvas')?.getBoundingClientRect()
    const center = canvas ? flow.screenToFlowPosition({ x: canvas.left + canvas.width * 0.48, y: canvas.top + canvas.height * 0.5 }) : undefined
    const sameKindCount = useSimulatorStore.getState().nodes.filter((node) => node.data.kind === kind).length
    const position = center ? { x: center.x + (sameKindCount % 3) * 210, y: center.y + Math.floor(sameKindCount / 3) * 112 } : undefined
    store.addNode(kind, position)
  }, [flow, store])

  const handleModule = (id: keyof typeof moduleInfo) => {
    if (id !== store.activeModule) {
      store.setSimulationResult(null)
      store.setPipelineResult(null)
      setAgentReviewApproved(false)
    }
    store.setActiveModule(id)
    if (id === 'devops') {
      store.setCanvasTab('pipeline')
      const pipelineNode = useSimulatorStore.getState().nodes.find((node) => node.data.kind === 'pipeline')
      if (pipelineNode) store.selectNode(pipelineNode.id)
      else addCanvasNode('pipeline')
    } else {
      store.setCanvasTab('architecture')
    }
  }

  const updateNodeHealth = useCallback((point: MetricPoint) => {
    store.setNodes((current) => current.map((node) => {
      const { kind, capacity } = node.data
      const cacheAdjusted = kind === 'database' ? point.incomingRps * (store.nodes.some((item) => item.data.kind === 'cache') ? 0.34 : 0.78) : kind === 'cache' ? point.incomingRps * 0.3 : point.incomingRps
      const ratio = capacity > 0 ? cacheAdjusted / capacity : 0
      const health = ratio > 1.16 ? 'crashed' : ratio > 0.82 ? 'degraded' : 'healthy'
      return { ...node, data: { ...node.data, health } }
    }))
  }, [store])

  const runStressTest = async () => {
    if (store.isRunning) return
    setAgentReviewApproved(false)
    store.setIsRunning(true)
    store.setSimulationProgress(0)
    store.setSimulationResult(null)
    store.setCurrentMetric({ ...starterMetric, incomingRps: 200, throughput: 200 })
    setMetricHistory([])
    setToast('Stress test started · traffic ramping to 3,000 RPS')
    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph: { nodes: store.nodes, edges: store.edges } }),
      })
      if (!response.ok) throw new Error('Simulation service returned an error')
      const result = await response.json() as SimulationResult
      for (let index = 0; index < result.timeline.length; index += 1) {
        const point = result.timeline[index]
        store.setCurrentMetric(point)
        store.setSimulationProgress(Math.round((index / (result.timeline.length - 1)) * 100))
        setMetricHistory((history) => [...history.slice(-22), point])
        updateNodeHealth(point)
        await new Promise((resolve) => window.setTimeout(resolve, 115))
      }
      store.setSimulationResult(result)
      store.setSimulationProgress(100)
      setToast(result.outcome === 'pass' ? 'Scenario cleared · architecture is within SLA' : result.outcome === 'conditional' ? 'SLAs held · architectural warnings remain' : 'Stress test failed · inspect the bottleneck report')
    } catch {
      setToast('Simulation API unavailable · run npm run dev to start both services')
      store.setApiOnline(false)
    } finally {
      store.setIsRunning(false)
    }
  }

  const runPipeline = async () => {
    if (store.activeModule === 'agents' && !agentReviewApproved) {
      setToast('Human sign-off is required before the multi-agent release can run.')
      return
    }
    if (store.pipelineRunning) return
    store.setPipelineRunning(true)
    store.setPipelineResult(null)
    setToast('Git push received · running delivery stages')
    try {
      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stages: store.pipelineStages,
          strategy: store.pipelineStrategy,
          canaryTraffic: store.canaryTraffic,
          rollbackThreshold: store.rollbackThreshold,
          rollbackEnabled: store.rollbackEnabled,
        }),
      })
      if (!response.ok) throw new Error('Pipeline simulation returned an error')
      const result = await response.json() as PipelineResult
      await new Promise((resolve) => window.setTimeout(resolve, 1100))
      store.setPipelineResult(result)
      setToast(result.message)
    } catch {
      setToast('Pipeline API unavailable · check that the simulation service is running')
      store.setApiOnline(false)
    } finally {
      store.setPipelineRunning(false)
    }
  }

  const clearResult = () => {
    store.setSimulationResult(null)
    store.setPipelineResult(null)
    setMetricHistory([])
    store.setCurrentMetric(null)
    store.setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, health: 'idle' } })))
  }

  const dismissBeginnerGuide = () => {
    setShowBeginnerGuide(false)
    try { window.localStorage.setItem('simengine-guide-dismissed', 'true') } catch { /* Storage can be disabled; the guide still closes for this session. */ }
  }

  const reopenBeginnerGuide = () => {
    setShowBeginnerGuide(true)
    try { window.localStorage.removeItem('simengine-guide-dismissed') } catch { /* The guide can still be reopened for this session. */ }
  }

  const openTopologyAudit = () => {
    store.setCanvasTab('architecture')
    store.selectNode(null)
    store.selectEdge(null)
  }

  const configureConnection = (sourceId: string, targetId: string, protocol: Protocol) => {
    const edge = useSimulatorStore.getState().edges.find((item) => item.source === sourceId && item.target === targetId)
    if (!edge) {
      setToast(`Connect ${sourceId} to ${targetId} first, then configure its protocol.`)
      return false
    }
    store.setCanvasTab('architecture')
    store.updateEdgeProtocol(edge.id, protocol)
    store.selectEdge(edge.id)
    return true
  }

  const focusNode = (kind: NodeKind) => {
    store.setCanvasTab('architecture')
    const target = useSimulatorStore.getState().nodes.find((node) => node.data.kind === kind)
    store.selectNode(target?.id || null)
  }

  const onDragStart = (event: DragEvent<HTMLButtonElement>, kind: NodeKind) => {
    event.dataTransfer.setData('application/simengine-node', kind)
    event.dataTransfer.effectAllowed = 'move'
  }

  const toggleStage = (id: string, patch: { enabled?: boolean; blocking?: boolean }) => {
    store.setPipelineStages((stages) => stages.map((stage) => stage.id === id ? { ...stage, ...patch } : stage))
  }

  const moveStage = (id: string, offset: -1 | 1) => {
    store.setPipelineStages((stages) => {
      const ordered = [...stages].sort((left, right) => left.order - right.order)
      const index = ordered.findIndex((stage) => stage.id === id)
      const destination = index + offset
      if (index < 0 || destination < 0 || destination >= ordered.length) return stages
      ;[ordered[index], ordered[destination]] = [ordered[destination], ordered[index]]
      return ordered.map((stage, position) => ({ ...stage, order: position + 1 }))
    })
  }

  const filteredModules = Object.entries(moduleInfo).filter(([, item]) => `${item.title} ${item.shortTitle}`.toLowerCase().includes(filterText.toLowerCase()))

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-symbol"><Workflow size={19} strokeWidth={2} /></span>
          <span><strong>simengine</strong><small>DESIGN LAB <span>03</span></small></span>
        </div>
        <div className="workspace-selector"><span className="workspace-avatar">N</span><span className="workspace-label"><strong>Northstar Labs</strong><small>Engineering team</small></span><ChevronDown size={15} /></div>
        <div className="side-search"><Search size={14} /><input aria-label="Search campaign" placeholder="Find a scenario…" value={filterText} onChange={(event) => setFilterText(event.target.value)} /><kbd>⌘ K</kbd></div>
        <div className="side-section-label">LEARNING PATH <span>4</span></div>
        <nav className="module-list" aria-label="Campaign modules">
          {filteredModules.map(([id, item], index) => {
            const moduleId = id as keyof typeof moduleInfo
            const active = store.activeModule === moduleId
            const completed = index === 0 && store.simulationResult?.outcome === 'pass'
            const Icon = [Layers3, Database, GitBranch, Sparkles][Object.keys(moduleInfo).indexOf(id)] || Layers3
            return (
              <button key={id} className={`module-link${active ? ' active' : ''}`} onClick={() => handleModule(moduleId)}>
                <span className={`module-index${active ? ' active' : ''}`}>{completed ? <Check size={13} /> : <Icon size={15} />}</span>
                <span className="module-copy"><strong>0{index + 1} <span>{item.title}</span></strong><small>{index === 0 ? '1 scenario · 12 min' : index === 2 ? 'Pipeline lab · 9 min' : 'Scenario · 10 min'}</small></span>
                {active ? <ChevronRight size={14} className="module-chevron" /> : index > 0 ? <LockKeyhole size={12} className="module-lock" /> : null}
              </button>
            )
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="campaign-progress">
          <div className="progress-label"><span>CAMPAIGN PROGRESS</span><strong>{store.simulationResult?.outcome === 'pass' ? '25%' : '0%'}</strong></div>
          <div className="progress-track"><span style={{ width: store.simulationResult?.outcome === 'pass' ? '25%' : '8%' }} /></div>
          <small>1 of 4 modules in progress</small>
        </div>
        <div className="sidebar-bottom">
          <button className="side-help" onClick={() => setShowHelp(true)}><CircleHelp size={16} /> Help & quick guide</button>
          <div className="profile-row"><span className="profile-avatar">JD</span><span><strong>Jordan Davis</strong><small>Systems engineer</small></span><span className="profile-menu">···</span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Learning path</span><ChevronRight size={13} /><span>{module.title}</span><ChevronRight size={13} /><strong>{module.shortTitle}</strong></div>
          <div className="topbar-right"><div className={`engine-status${store.apiOnline ? ' online' : ''}`}><span />{store.apiOnline ? 'ENGINE ONLINE' : 'ENGINE CONNECTING'}</div><button className="guide-launch" onClick={reopenBeginnerGuide}><Sparkles size={13} /> Guide</button><button className="icon-button" aria-label="Help and terminology" onClick={() => setShowHelp(true)}><CircleHelp size={17} /></button><span className="top-avatar">JD</span></div>
        </header>

        <div className="dashboard-content">
          <section className="mission-heading">
            <div className="mission-copy">
              <div className="eyebrow-row"><span className="eyebrow-badge">MODULE {module.number}</span><span className="eyebrow-dot" /> <span>INCIDENT RESPONSE</span><span className="difficulty-pill"><span /> INTERMEDIATE</span></div>
              <h1>{module.shortTitle}</h1>
              <p>{module.focus}</p>
            </div>
            <div className="mission-reward"><span className="reward-icon"><Sparkles size={17} /></span><div><small>SCENARIO REWARD</small><strong>+350 XP <span>·</span> Resilience badge</strong></div><button aria-label="Scenario reward info" onClick={() => setShowHelp(true)}><CircleHelp size={15} /></button></div>
          </section>

          <section className="objective-bar">
            <div className="incident-block"><span className="incident-icon"><AlertCircle size={16} /></span><div><span className="incident-label">INCIDENT REPORT <b>·</b> 12:04 UTC</span><p>{module.incident}</p></div></div>
            <div className="objective-divider" />
            <div className="sla-block"><span className="sla-heading"><TargetMark /> LEVEL OBJECTIVES</span><div className="sla-chips"><span><GaugeIcon /> P95 &lt; 300ms</span><span><Activity size={13} /> Errors &lt; 1%</span><span><Shield size={13} /> Uptime ≥ 99%</span></div></div>
          </section>

          <BeginnerGuide
            visible={showBeginnerGuide}
            moduleId={store.activeModule}
            auditReady={auditReady}
            audit={audit}
            nodes={nodes}
            edges={edges}
            simulationResult={store.simulationResult}
            pipelineResult={store.pipelineResult}
            onDismiss={dismissBeginnerGuide}
            onHelp={() => setShowHelp(true)}
            onOpenAudit={openTopologyAudit}
            onFocusNode={focusNode}
            onAddNode={addCanvasNode}
            onRunStressTest={runStressTest}
            onRunPipeline={runPipeline}
            onConfigureConnection={configureConnection}
            agentReviewApproved={agentReviewApproved}
            onApproveAgentReview={() => setAgentReviewApproved(true)}
          />

          <section className="workbench-section">
            <div className="workbench-titlebar">
              <div className="workbench-title"><span className="workbench-icon"><Workflow size={17} /></span><div><strong>System workspace</strong><small>DESIGN · TEST · IMPROVE</small></div></div>
              <div className="workbench-actions">
                <div className="canvas-tabs" role="tablist" aria-label="Workspace mode">
                  <button role="tab" aria-selected={!isPipelineView} className={!isPipelineView ? 'selected' : ''} onClick={() => store.setCanvasTab('architecture')}><Boxes size={14} /> Architecture</button>
                  <button role="tab" aria-selected={isPipelineView} className={isPipelineView ? 'selected' : ''} onClick={() => { store.setCanvasTab('pipeline'); const pipelineNode = nodes.find((node) => node.data.kind === 'pipeline'); if (pipelineNode) store.selectNode(pipelineNode.id); else addCanvasNode('pipeline') }}><GitBranch size={14} /> CI/CD pipeline <span className="tab-new-dot" /></button>
                </div>
                <button className="reset-button" onClick={() => { store.reset(); setAgentReviewApproved(false); setAudit({ antiPatterns: [] }); setMetricHistory([]); setToast('Architecture reset to the incident baseline') }}><RotateCcw size={14} /><span>Reset</span></button>
                <button className={`run-button${store.isRunning ? ' running' : ''}`} onClick={isPipelineView ? runPipeline : runStressTest} disabled={store.isRunning || store.pipelineRunning}>
                  {store.isRunning || store.pipelineRunning ? <span className="button-spinner" /> : isPipelineView ? <GitBranch size={15} /> : <Play size={14} fill="currentColor" />}
                  {store.isRunning ? 'Running test…' : store.pipelineRunning ? 'Executing…' : isPipelineView ? 'Trigger Git push' : 'Run stress test'}
                  {!store.isRunning && !store.pipelineRunning ? <span className="button-shortcut">⌘ ↵</span> : null}
                </button>
              </div>
            </div>

            <div className="palette-row">
              <span className="palette-label">COMPONENTS</span>
              {palette.map(({ kind, label, icon: Icon }) => <button key={kind} className="palette-item" draggable onDragStart={(event) => onDragStart(event, kind)} onClick={() => addCanvasNode(kind)} title={`Drag or click to add ${label}`}><Icon size={14} /><span>{label}</span><Plus size={11} className="palette-plus" /></button>)}
              <span className="palette-tip"><span className="tip-drag-icon">⠿</span> Drag onto canvas or click to add</span>
            </div>

            <div className="workspace-grid">
              <div className="canvas-panel">
                <div className="canvas-toolbar">
                  <div className="canvas-status"><span className={store.isRunning ? 'live-pulse' : 'canvas-dot'} />{store.isRunning ? 'LIVE SIMULATION' : 'ARCHITECTURE CANVAS'}<span className="toolbar-separator">/</span><span>{nodes.length} nodes</span><span>·</span><span>{edges.length} connections</span></div>
                  <div className="canvas-tools"><span className="zoom-label">100%</span><button className="canvas-tool" title="Canvas controls"><SlidersHorizontal size={14} /></button><button className="canvas-tool" title="Workspace settings"><Settings2 size={14} /></button></div>
                </div>
                <ArchitectureCanvas onAddNode={addCanvasNode} />
                {store.isRunning ? <div className="simulation-progress"><span style={{ width: `${store.simulationProgress}%` }} /></div> : null}
                <div className="canvas-legend"><span><i className="legend-dot legend-healthy" /> Healthy</span><span><i className="legend-dot legend-degraded" /> Degraded</span><span><i className="legend-dot legend-crashed" /> Critical</span><span className="legend-flow"><span className="flow-particle" /> Request flow</span></div>
              </div>

              <aside className="inspector-panel">
                <div className="inspector-header"><div><span className="inspector-kicker">{isPipelineView ? 'DELIVERY WORKFLOW' : selectedEdge ? 'CONNECTION CONFIG' : selectedNode ? 'COMPONENT CONFIG' : 'SYSTEM AUDIT'}</span><h2>{isPipelineView ? 'Release pipeline' : selectedEdge ? 'Connection' : selectedNode ? selectedNode.data.label : 'Topology audit'}</h2></div><button className="icon-button small" title="Clear selection" onClick={() => { store.selectNode(null); store.selectEdge(null) }}><X size={14} /></button></div>
                {isPipelineView ? <PipelineInspector onRun={runPipeline} toggleStage={toggleStage} moveStage={moveStage} /> : selectedEdge ? <ConnectionInspector edge={selectedEdge} onProtocol={(protocol) => store.updateEdgeProtocol(selectedEdge.id, protocol)} onDelete={() => { store.setEdges((current) => current.filter((edge) => edge.id !== selectedEdge.id)); store.selectEdge(null) }} /> : selectedNode ? <NodeInspector node={selectedNode} onUpdate={(patch) => store.updateNodeData(selectedNode.id, patch)} onDelete={() => { store.setNodes((current) => current.filter((node) => node.id !== selectedNode.id)); store.setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)); store.selectNode(null) }} /> : <AuditInspector audit={audit} onFocus={(id) => { const findingNode = nodes.find((node) => node.data.kind === (id === 'shared-database' ? 'database' : 'service')); if (findingNode) store.selectNode(findingNode.id) }} />}
              </aside>
            </div>
          </section>

          <section className="telemetry-section">
            <div className="telemetry-heading"><div><span className="telemetry-pulse" /><strong>Live telemetry</strong><span className="telemetry-range">{store.isRunning || store.simulationResult ? `T+00:${String(metric.second).padStart(2, '0')}` : 'AWAITING TEST RUN'}</span></div><button className="telemetry-link" onClick={() => setShowHelp(true)}>How metrics work <ArrowRight size={13} /></button></div>
            <div className="metric-grid">
              <MetricCard label="Throughput" value={metric.throughput} suffix=" rps" data={visibleHistory} metric="throughput" icon={TrendingUp} tone="blue" />
              <MetricCard label="Error rate" value={metric.errorRate} suffix="%" data={visibleHistory} metric="errorRate" icon={Activity} tone="rose" precision={2} />
              <MetricCard label="P95 latency" value={metric.p95} suffix=" ms" data={visibleHistory} metric="p95" icon={Timer} tone="violet" />
              <MetricCard label="CPU utilization" value={metric.cpu} suffix="%" data={visibleHistory} metric="cpu" icon={Cpu} tone="amber" />
            </div>
          </section>

          {store.simulationResult ? <EvaluationPanel result={store.simulationResult} onRetry={clearResult} /> : null}
        </div>
      </main>
      {toast ? <div className="toast-message"><span className="toast-indicator" /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div> : null}
      {showHelp ? <HelpDialog onClose={() => setShowHelp(false)} /> : null}
    </div>
  )
}

type GuideModuleId = keyof typeof moduleInfo

type BeginnerGuideProps = {
  visible: boolean
  moduleId: GuideModuleId
  auditReady: boolean
  audit: { antiPatterns: AntiPattern[] }
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  simulationResult: SimulationResult | null
  pipelineResult: PipelineResult | null
  agentReviewApproved: boolean
  onDismiss: () => void
  onHelp: () => void
  onOpenAudit: () => void
  onFocusNode: (kind: NodeKind) => void
  onAddNode: (kind: NodeKind) => void
  onRunStressTest: () => void
  onRunPipeline: () => void
  onConfigureConnection: (sourceId: string, targetId: string, protocol: Protocol) => boolean
  onApproveAgentReview: () => void
}

function BeginnerGuide({ visible, moduleId, auditReady, audit, nodes, edges, simulationResult, pipelineResult, agentReviewApproved, onDismiss, onHelp, onOpenAudit, onFocusNode, onAddNode, onRunStressTest, onRunPipeline, onConfigureConnection, onApproveAgentReview }: BeginnerGuideProps) {
  const store = useSimulatorStore()
  const [briefReviewed, setBriefReviewed] = useState(false)
  const [inventoryPathReviewed, setInventoryPathReviewed] = useState(false)
  const [dataFlowReviewed, setDataFlowReviewed] = useState(false)
  const [advisorReviewed, setAdvisorReviewed] = useState(false)
  useEffect(() => {
    setBriefReviewed(false)
    setInventoryPathReviewed(false)
    setDataFlowReviewed(false)
    setAdvisorReviewed(false)
  }, [moduleId])
  if (!visible) return null

  const pipelineMode = moduleId === 'devops'
  const dataMode = moduleId === 'data'
  const agentMode = moduleId === 'agents'
  const databaseIssue = audit.antiPatterns.some((item) => item.id === 'shared-database' || item.id === 'missing-persistence')
  const cacheIssue = audit.antiPatterns.some((item) => item.id === 'uncached-reads')
  const databaseCount = nodes.filter((node) => node.data.kind === 'database').length
  const serviceCount = nodes.filter((node) => node.data.kind === 'service').length
  const cacheNode = nodes.find((node) => node.data.kind === 'cache')
  const testStage = store.pipelineStages.find((stage) => stage.id === 'tests')
  const testGateReady = Boolean(testStage?.enabled && testStage.blocking)
  const rollbackReady = store.pipelineStrategy === 'canary' && store.rollbackEnabled && store.rollbackThreshold <= 2
  const databaseReady = auditReady && !databaseIssue
  const cacheReady = auditReady && !cacheIssue
  const inventoryWriteEdge = edges.find((edge) => edge.source === 'checkout' && edge.target === 'inventory')
  const inventoryPathReady = inventoryWriteEdge?.data?.protocol === 'gRPC' && inventoryPathReviewed
  const brokerNode = nodes.find((node) => node.data.kind === 'broker')
  const inventoryEventEdge = brokerNode ? edges.find((edge) => edge.source === 'inventory' && edge.target === brokerNode.id) : undefined
  const inventoryEventsReady = inventoryEventEdge?.data?.protocol === 'AMQP'
  const dataFlowReady = inventoryPathReady && inventoryEventsReady
  const safePipelineResult = Boolean(pipelineResult && ['protected', 'recovered'].includes(pipelineResult.outcome))

  type Step = { done: boolean; title: string; description: string; action: string; onAction: () => void; disabled?: boolean }
  const steps: Step[] = pipelineMode ? [
    { done: testGateReady, title: 'Make tests a blocking gate', description: 'Keep “Unit & integration tests” enabled and Blocking. This catches the simulated memory leak before a deploy starts.', action: testGateReady ? 'Review test gate' : 'Set blocking tests', onAction: () => { store.setCanvasTab('pipeline'); store.setPipelineStages((stages) => stages.map((stage) => stage.id === 'tests' ? { ...stage, enabled: true, blocking: true } : stage)) } },
    { done: rollbackReady, title: 'Protect the rollout', description: 'Choose Canary, send a small traffic share, and enable auto rollback at 2% error rate.', action: rollbackReady ? 'Review rollout settings' : 'Use safe canary settings', onAction: () => { store.setCanvasTab('pipeline'); store.setPipelineOptions({ pipelineStrategy: 'canary', canaryTraffic: 10, rollbackEnabled: true, rollbackThreshold: 2 }) } },
    { done: Boolean(pipelineResult && ['protected', 'recovered'].includes(pipelineResult.outcome)), title: 'Send the buggy change', description: 'Trigger the simulated Git push. Watch whether tests block it or canary monitoring rolls it back.', action: pipelineResult ? 'Run push again' : 'Trigger Git push', onAction: onRunPipeline },
    { done: Boolean(pipelineResult && ['protected', 'recovered'].includes(pipelineResult.outcome)), title: 'Read the release result', description: pipelineResult ? pipelineResult.message : 'A safe result says “Regression blocked” or “Automated recovery.” Production should remain untouched.', action: pipelineResult ? 'View pipeline logs' : 'Open pipeline view', onAction: () => store.setCanvasTab('pipeline') },
  ]
    : dataMode ? [
      { done: inventoryPathReady, title: 'Protect the inventory reservation write', description: inventoryPathReady ? 'Checkout waits for the authoritative Inventory service over gRPC before confirming a reservation.' : inventoryWriteEdge ? 'Reservations need an immediate authoritative answer. Configure Checkout → Inventory as synchronous gRPC; do not put this write behind a queue.' : 'Reconnect Checkout → Inventory first. Stock reservations must be confirmed by the authoritative Inventory service.', action: inventoryPathReady ? 'Review reservation path' : inventoryWriteEdge?.data?.protocol === 'gRPC' ? 'Confirm gRPC path' : 'Set path to gRPC', onAction: () => { if (onConfigureConnection('checkout', 'inventory', 'gRPC')) setInventoryPathReviewed(true) } },
      { done: inventoryEventsReady, title: 'Publish inventory changes asynchronously', description: inventoryEventsReady ? 'Inventory publishes downstream updates over AMQP while the reservation itself stays synchronous.' : brokerNode ? 'Connect Inventory → Broker, select that edge, and set its protocol to AMQP. Keep the Checkout → Inventory reservation path synchronous.' : 'Add an event broker, then connect Inventory → Broker and set the connection type to AMQP. Use the queue for updates, not reservation approval.', action: brokerNode ? 'Select event broker' : 'Add event broker', onAction: () => brokerNode ? onFocusNode('broker') : onAddNode('broker') },
      { done: Boolean(dataFlowReviewed && dataFlowReady), title: 'Review the two data lanes', description: 'Confirm the distinction: gRPC is the authoritative stock reservation; AMQP carries downstream inventory-change events. This avoids treating delayed events as proof of available stock.', action: dataFlowReviewed ? 'Review data paths again' : 'Confirm data-flow review', disabled: !dataFlowReady, onAction: () => { setDataFlowReviewed(true); onFocusNode('broker') } },
      { done: Boolean(simulationResult), title: 'Run a capacity check', description: simulationResult ? `${simulationResult.summary} Note: this stress test checks load and latency; it does not simulate a regional partition or prove consistency.` : 'Run the traffic ramp and inspect latency and errors. This simulator does not model regional partitions, so treat this as a capacity check—not proof of zero overselling.', action: simulationResult ? 'Run capacity check again' : 'Run stress test', onAction: onRunStressTest },
    ] : agentMode ? [
      { done: Boolean(simulationResult), title: 'Generate a review packet', description: simulationResult ? 'A local 4D topology review and stress-test result are ready.' : 'Run the scenario to generate a deterministic review across decomposition, resilience, data & scale, and delivery.', action: simulationResult ? 'Regenerate review packet' : 'Run stress test', onAction: onRunStressTest },
      { done: advisorReviewed, title: 'Review the four dimensions', description: 'Read each finding and decide whether the design is safe to proceed. This is an offline heuristic review—not an external AI agent.', action: advisorReviewed ? 'Open 4D review again' : 'Open 4D review', disabled: !simulationResult, onAction: () => { document.querySelector('.four-d-review')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setAdvisorReviewed(true) } },
      { done: agentReviewApproved, title: 'Record human sign-off', description: agentReviewApproved ? 'A human has accepted responsibility for this review. Changing modules or rerunning the test clears this approval.' : 'After reading the four dimensions, explicitly approve the current review. The release action stays blocked until you do.', action: agentReviewApproved ? 'Approval recorded' : 'Approve reviewed design', disabled: !advisorReviewed, onAction: onApproveAgentReview },
      { done: safePipelineResult, title: 'Run the guarded release', description: pipelineResult ? pipelineResult.message : 'Trigger the simulated release only after sign-off. A safe outcome blocks the regression or automatically recovers without production impact.', action: pipelineResult ? 'Run release again' : 'Open pipeline and run', disabled: !agentReviewApproved, onAction: () => { store.setCanvasTab('pipeline'); onRunPipeline() } },
    ] : [
      { done: briefReviewed, title: 'Start with the system audit', description: 'The incident came from one database shared by Checkout, Inventory, and Payments. Open the audit to see the risks before changing anything.', action: 'Open topology audit', onAction: () => { onOpenAudit(); setBriefReviewed(true) } },
      { done: databaseReady, title: 'Give each service its own database', description: databaseReady ? 'Each service has an independent persistence connection.' : databaseCount < serviceCount ? `There are ${databaseCount} database${databaseCount === 1 ? '' : 's'} for ${serviceCount} services. Add ${Math.max(1, serviceCount - databaseCount)} more, connect each service to a different database, then remove the shared links.` : 'Database nodes are present, but at least two services still share one. Select a service and connect it to its own database.', action: databaseCount < serviceCount ? 'Add a database' : 'Select a service', onAction: () => databaseCount < serviceCount ? onAddNode('database') : onFocusNode('service') },
      { done: cacheReady, title: 'Route hot reads through a cache', description: cacheReady ? 'A connected cache now absorbs the hot-read load before it reaches the database.' : cacheNode ? 'A cache node exists. Connect Gateway → Cache and Cache → Checkout, then remove the old direct Gateway → Checkout connection.' : 'Add a Cache from the component strip. Then connect Gateway → Cache → Checkout so repeated reads avoid the database.', action: cacheNode ? 'Select the cache' : 'Add a cache', onAction: () => cacheNode ? onFocusNode('cache') : onAddNode('cache') },
      { done: simulationResult?.outcome === 'pass', title: 'Run the flash-sale test', description: simulationResult ? simulationResult.summary : 'Run the 30-second ramp to 3,000 requests per second. Pass means P95 < 300ms, errors < 1%, uptime ≥ 99%, and no critical findings.', action: simulationResult?.outcome === 'pass' ? 'Run test again' : 'Run stress test', onAction: onRunStressTest },
    ]

  const activeStep = steps.findIndex((step) => !step.done)
  const guideEyebrow = pipelineMode ? 'PIPELINE CHALLENGE' : dataMode ? 'DISTRIBUTED DATA CHALLENGE' : agentMode ? 'HUMAN-OVERSIGHT CHALLENGE' : 'ARCHITECTURE CHALLENGE'
  const guideTitle = pipelineMode ? 'Keep the buggy release out of production.' : dataMode ? 'Protect inventory correctness during failure.' : agentMode ? 'Make automated review accountable to a human.' : 'Make the checkout system survive a flash sale.'

  return (
    <section className="beginner-guide" aria-labelledby="beginner-guide-title">
      <div className="beginner-guide-header">
        <div className="beginner-guide-mark"><Sparkles size={15} /></div>
        <div className="beginner-guide-title-wrap"><div><span className="beginner-guide-eyebrow">START HERE · {guideEyebrow}</span><button className="guide-help-link" onClick={onHelp}>What does this mean? <ArrowRight size={11} /></button></div><h2 id="beginner-guide-title">{guideTitle}</h2><p><strong>Your goal:</strong> {moduleInfo[moduleId].objective}</p></div>
        <button className="guide-dismiss" onClick={onDismiss}><X size={13} /><span>Hide guide</span></button>
      </div>
      <div className="beginner-guide-steps" aria-label="Challenge steps">
        {steps.map((step, index) => <GuideStep key={`${moduleId}-${step.title}`} number={index + 1} active={!step.done && activeStep === index} done={step.done} title={step.title} description={step.description} action={step.action} disabled={step.disabled} onAction={step.onAction} />)}
      </div>
      {!auditReady && (moduleId === 'monolith' || dataMode) ? <div className="guide-engine-note"><span className="guide-loading-dot" />Topology audit is connecting. Start with the briefing; live checks appear once the simulation engine is online.</div> : null}
    </section>
  )
}

function GuideStep({ number, active, done, title, description, action, onAction, disabled = false }: { number: number; active: boolean; done: boolean; title: string; description: string; action: string; onAction: () => void; disabled?: boolean }) {
  return (
    <article className={`beginner-step${active ? ' is-current' : ''}${done ? ' is-done' : ''}`}>
      <div className="beginner-step-top"><span className="beginner-step-number">{done ? <Check size={13} /> : `0${number}`}</span><span className={`beginner-step-status${active ? ' current' : ''}`}>{done ? 'DONE' : active ? 'START HERE' : 'UP NEXT'}</span></div>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="beginner-step-action" onClick={onAction} disabled={disabled}>{action}<ArrowRight size={12} /></button>
    </article>
  )
}

function TargetMark() {
  return <span className="target-mark"><span /><i /></span>
}

function GaugeIcon() {
  return <span className="mini-gauge">⌁</span>
}

function ArchitectureCanvas({ onAddNode }: { onAddNode: (kind: NodeKind) => void }) {
  const flow = useReactFlow<DiagramNode, DiagramEdge>()
  const { nodes, edges, setNodes, setEdges, selectNode, selectEdge, isRunning } = useSimulatorStore()
  const handleNodesChange = useCallback((changes: NodeChange<DiagramNode>[]) => setNodes((current) => applyNodeChanges(changes, current)), [setNodes])
  const handleEdgesChange = useCallback((changes: EdgeChange<DiagramEdge>[]) => setEdges((current) => applyEdgeChanges(changes, current)), [setEdges])
  const handleConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, id: `edge-${Date.now().toString(36)}`, type: 'smoothstep', animated: isRunning, label: 'HTTP', data: { protocol: 'HTTP' }, style: { stroke: '#5869df' } }, current) as DiagramEdge[])
  }, [isRunning, setEdges])
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const kind = event.dataTransfer.getData('application/simengine-node') as NodeKind
    if (!kind) return
    onAddNode(kind)
    const newId = useSimulatorStore.getState().selectedNodeId
    const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    if (newId) setNodes((current) => current.map((node) => node.id === newId ? { ...node, position } : node))
  }
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }

  return (
    <div className="flow-canvas" onDrop={handleDrop} onDragOver={handleDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges.map((edge) => ({ ...edge, animated: isRunning, style: { stroke: isRunning ? '#7582ff' : '#4a566b', strokeWidth: 1.7 } }))}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_event, node) => selectNode(node.id)}
        onEdgeClick={(_event, edge) => selectEdge(edge.id)}
        onPaneClick={() => { selectNode(null); selectEdge(null) }}
        nodeTypes={nodeTypes}
        nodesConnectable
        connectionMode={ConnectionMode.Strict}
        connectionRadius={24}
        fitView
        fitViewOptions={{ padding: 0.16, duration: 450 }}
        minZoom={0.35}
        maxZoom={1.5}
        defaultEdgeOptions={{ type: 'smoothstep', interactionWidth: 18 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={21} size={1} color="#263142" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => {
          const data = node.data as DiagramNode['data']
          return data.health === 'crashed' ? '#f36b72' : data.health === 'degraded' ? '#f4b85d' : '#6676ee'
        }} maskColor="rgba(10, 14, 22, 0.72)" />
      </ReactFlow>
      {nodes.length === 0 ? <div className="canvas-empty"><Workflow size={28} /><strong>Your canvas is clear</strong><span>Add a component or drag one in to start designing.</span><button onClick={() => onAddNode('service')}>Add first service <Plus size={14} /></button></div> : null}
      <div className="canvas-drag-hint"><span>↗</span> Drag a right-side output port to a left-side input port</div>
    </div>
  )
}

function NodeInspector({ node, onUpdate, onDelete }: { node: DiagramNode; onUpdate: (patch: Partial<DiagramNode['data']>) => void; onDelete: () => void }) {
  const health = node.data.health || 'idle'
  const [showAdvanced, setShowAdvanced] = useState(false)
  return (
    <div className="inspector-body">
      <div className="selected-component"><span className={`component-icon component-${node.data.kind}`}><IconForKind kind={node.data.kind} /></span><div><strong>{kindTitle[node.data.kind]}</strong><span>{node.data.description || 'System component'}</span></div></div>
      <div className="inspector-section-label">CONFIGURATION <span>01</span></div>
      <label className="field-label" htmlFor="component-name">Component name</label>
      <input id="component-name" className="text-field" value={node.data.label} onChange={(event) => onUpdate({ label: event.target.value })} />
      {node.data.kind !== 'pipeline' ? <>
        <div className="slider-label"><label htmlFor="capacity">Max capacity</label><span>{node.data.capacity.toLocaleString()} <small>RPS</small></span></div>
        <input id="capacity" className="range-slider" type="range" min="400" max="6000" step="100" value={node.data.capacity} onChange={(event) => onUpdate({ capacity: Number(event.target.value) })} style={{ '--range-progress': `${((node.data.capacity - 400) / 5600) * 100}%` } as CSSProperties} />
        <div className="range-ends"><span>400 RPS</span><span>6,000 RPS</span></div>
        <div className="slider-label latency-label"><label htmlFor="latency">Base latency</label><span>{node.data.latency} <small>ms</small></span></div>
        <input id="latency" className="range-slider" type="range" min="1" max="300" step="1" value={node.data.latency} onChange={(event) => onUpdate({ latency: Number(event.target.value) })} style={{ '--range-progress': `${((node.data.latency - 1) / 299) * 100}%` } as CSSProperties} />
        <div className="range-ends"><span>1 ms</span><span>300 ms</span></div>
      </> : <div className="pipeline-inspector-note"><GitBranch size={16} />Configure quality gates and rollout behavior in the delivery sequencer.</div>}
      <div className="health-summary"><div className="health-summary-head"><span>Current health</span><span className={`health-pill health-pill--${health}`}><i />{health === 'idle' ? 'Awaiting test' : health}</span></div><div className="health-summary-copy">{health === 'crashed' ? 'Over capacity — requests are failing.' : health === 'degraded' ? 'Approaching capacity during peak load.' : health === 'healthy' ? 'Operating within configured limits.' : 'Run a stress test to see this component under load.'}</div></div>
      {showAdvanced ? <div className="advanced-config"><div><span>Autoscaling</span><strong>{node.data.kind === 'database' ? 'Disabled' : '2 – 8 replicas'}</strong></div><div><span>Timeout policy</span><strong>{node.data.kind === 'service' ? '800 ms' : 'Default'}</strong></div></div> : null}
      <button className="advanced-button" onClick={() => setShowAdvanced((value) => !value)}>{showAdvanced ? 'Hide' : 'Show'} advanced settings <ChevronDown size={13} className={showAdvanced ? 'rotate-up' : ''} /></button>
      <div className="inspector-bottom"><span className="node-id">ID · {node.id.slice(0, 12)}</span><button className="delete-node-button" onClick={onDelete}><Trash2 size={13} /> Remove</button></div>
    </div>
  )
}

function IconForKind({ kind }: { kind: NodeKind }) {
  const Icon = kindIcon[kind] || Globe2
  return <Icon size={17} />
}

function ConnectionInspector({ edge, onProtocol, onDelete }: { edge: DiagramEdge; onProtocol: (protocol: Protocol) => void; onDelete: () => void }) {
  return (
    <div className="inspector-body connection-inspector">
      <div className="selected-component"><span className="component-icon component-link"><Workflow size={16} /></span><div><strong>Directed connection</strong><span>{edge.source} → {edge.target}</span></div></div>
      <div className="inspector-section-label">TRANSPORT PROTOCOL <span>01</span></div>
      <label className="field-label" htmlFor="protocol-select">Connection type</label>
      <select id="protocol-select" className="text-field select-field" value={edge.data?.protocol || 'HTTP'} onChange={(event) => onProtocol(event.target.value as Protocol)}>
        <option value="HTTP">HTTP REST · synchronous</option><option value="gRPC">gRPC · synchronous</option><option value="AMQP">AMQP · asynchronous</option><option value="SQL">SQL · database protocol</option>
      </select>
      <div className="protocol-explainer"><span className="protocol-indicator" /><p>{edge.data?.protocol === 'AMQP' ? 'Queued messaging decouples the services and helps prevent failure propagation.' : 'Synchronous requests pass latency and failures to the calling service.'}</p></div>
      <div className="inspector-bottom"><span className="node-id">EDGE · {edge.id.slice(0, 12)}</span><button className="delete-node-button" onClick={onDelete}><Trash2 size={13} /> Remove</button></div>
    </div>
  )
}

function AuditInspector({ audit, onFocus }: { audit: { antiPatterns: AntiPattern[]; longestSyncChain?: number }; onFocus: (id: string) => void }) {
  const critical = audit.antiPatterns.filter((item) => item.severity === 'critical').length
  return (
    <div className="inspector-body audit-inspector">
      <div className="audit-score-card"><div className="audit-score-top"><span className="score-ring"><span>{Math.max(0, 100 - audit.antiPatterns.length * 22)}</span></span><div><strong>{critical ? 'Needs attention' : audit.antiPatterns.length ? 'Room to improve' : 'Healthy topology'}</strong><small>Structural readiness</small></div></div><div className="score-meter"><span style={{ width: `${Math.max(8, 100 - audit.antiPatterns.length * 22)}%` }} /></div></div>
      <div className="inspector-section-label">DESIGN FINDINGS <span>{String(audit.antiPatterns.length).padStart(2, '0')}</span></div>
      {audit.antiPatterns.length ? <div className="finding-list">{audit.antiPatterns.map((finding) => <button className="finding-item" key={finding.id} onClick={() => onFocus(finding.id)}><span className={`finding-icon finding-icon--${finding.severity}`}>{finding.severity === 'critical' ? <ShieldAlert size={14} /> : <AlertCircle size={14} />}</span><span><strong>{finding.title}</strong><small>{finding.detail}</small></span><ChevronRight size={14} /></button>)}</div> : <div className="no-findings"><CheckCircle2 size={20} /><strong>No structural risks detected</strong><span>Run the stress test to validate behavior under peak load.</span></div>}
      <div className="topology-tip"><Sparkles size={14} /><p><strong>Pro tip</strong> Use AMQP between services to decouple failure paths. Add a cache to keep hot reads away from the database.</p></div>
      <div className="inspector-bottom"><span className="node-id">SYNC DEPTH · {audit.longestSyncChain || '—'} hops</span><span className="audit-live"><i /> LIVE AUDIT</span></div>
    </div>
  )
}

function PipelineInspector({ onRun, toggleStage, moveStage }: { onRun: () => void; toggleStage: (id: string, patch: { enabled?: boolean; blocking?: boolean }) => void; moveStage: (id: string, offset: -1 | 1) => void }) {
  const store = useSimulatorStore()
  const result = store.pipelineResult
  return (
    <div className="inspector-body pipeline-inspector">
      <div className="pipeline-summary"><span className="pipeline-summary-icon"><GitBranch size={16} /></span><div><strong>checkout-service</strong><small>main → production <span>·</span> on push</small></div><span className="pipeline-badge">ACTIVE</span></div>
      <div className="inspector-section-label">QUALITY GATES <span>{store.pipelineStages.filter((stage) => stage.enabled).length} / 5</span></div>
      <div className="pipeline-stage-list">{[...store.pipelineStages].sort((left, right) => left.order - right.order).map((stage, index, ordered) => <div className={`pipeline-stage${stage.enabled ? '' : ' stage-disabled'}`} key={stage.id}>
        <span className="stage-rail"><span>{stage.enabled ? <Check size={11} /> : <span className="stage-index">{index + 1}</span>}</span>{index < store.pipelineStages.length - 1 ? <i /> : null}</span>
        <div className="stage-content"><div className="stage-title-row"><strong>{stage.name}</strong><div className="stage-controls"><span className="stage-order-controls"><button aria-label={`Move ${stage.name} earlier`} disabled={index === 0} onClick={() => moveStage(stage.id, -1)}><ChevronUp size={10} /></button><button aria-label={`Move ${stage.name} later`} disabled={index === ordered.length - 1} onClick={() => moveStage(stage.id, 1)}><ChevronDown size={10} /></button></span><button className={`toggle-switch${stage.enabled ? ' on' : ''}`} role="switch" aria-checked={stage.enabled} aria-label={`Enable ${stage.name}`} onClick={() => toggleStage(stage.id, { enabled: !stage.enabled })}><i /></button></div></div><span>{stage.note}</span>
          {stage.enabled ? <button className={`blocking-toggle${stage.blocking ? ' blocking' : ''}`} onClick={() => toggleStage(stage.id, { blocking: !stage.blocking })}><span className="blocking-dot" />{stage.blocking ? 'Blocking gate' : 'Warning only'}<ChevronDown size={11} /></button> : null}
        </div>
      </div>)}</div>
      <div className="inspector-section-label rollout-label">ROLLOUT STRATEGY <span>05</span></div>
      <div className="strategy-switch"><button className={store.pipelineStrategy === 'canary' ? 'selected' : ''} onClick={() => store.setPipelineOptions({ pipelineStrategy: 'canary' })}><Activity size={13} /> Canary</button><button className={store.pipelineStrategy === 'blue-green' ? 'selected' : ''} onClick={() => store.setPipelineOptions({ pipelineStrategy: 'blue-green' })}><Layers3 size={13} /> Blue / green</button></div>
      {store.pipelineStrategy === 'canary' ? <>
        <div className="slider-label pipeline-slider-label"><label htmlFor="canary-percent">Canary traffic</label><span>{store.canaryTraffic}<small>%</small></span></div>
        <input id="canary-percent" className="range-slider" type="range" min="5" max="50" step="5" value={store.canaryTraffic} onChange={(event) => store.setPipelineOptions({ canaryTraffic: Number(event.target.value) })} style={{ '--range-progress': `${((store.canaryTraffic - 5) / 45) * 100}%` } as CSSProperties} />
        <div className="rollback-row"><span className="rollback-icon"><RotateCcw size={13} /></span><span><strong>Auto rollback</strong><small>Error rate exceeds</small></span><button className={`toggle-switch${store.rollbackEnabled ? ' on' : ''}`} role="switch" aria-checked={store.rollbackEnabled} onClick={() => store.setPipelineOptions({ rollbackEnabled: !store.rollbackEnabled })}><i /></button></div>
        <div className="threshold-row"><span>Canary error threshold</span><div className="threshold-control"><button aria-label="Decrease rollback threshold" onClick={() => store.setPipelineOptions({ rollbackThreshold: Math.max(0.5, store.rollbackThreshold - 0.5) })}><Minus size={11} /></button><strong>{store.rollbackThreshold.toFixed(store.rollbackThreshold % 1 ? 1 : 0)}%</strong><button aria-label="Increase rollback threshold" onClick={() => store.setPipelineOptions({ rollbackThreshold: Math.min(8, store.rollbackThreshold + 0.5) })}><Plus size={11} /></button></div></div>
      </> : <div className="bluegreen-note"><Layers3 size={15} /> Route all traffic to the new pool after smoke checks pass.</div>}
      <button className="pipeline-push-button" onClick={onRun} disabled={store.pipelineRunning}>{store.pipelineRunning ? <span className="button-spinner" /> : <Code2 size={14} />} {store.pipelineRunning ? 'Running stages…' : 'Trigger buggy Git push'}<span>↗</span></button>
      {result ? <PipelineResultCard result={result} /> : <div className="pipeline-hint"><Sparkles size={13} /><span>Push contains a simulated memory leak. Configure your gates to protect production.</span></div>}
    </div>
  )
}

function PipelineResultCard({ result }: { result: PipelineResult }) {
  const good = result.outcome === 'protected' || result.outcome === 'recovered'
  return <div className={`pipeline-result pipeline-result--${good ? 'good' : 'bad'}`}><div className="pipeline-result-title">{good ? <BadgeCheck size={15} /> : <AlertCircle size={15} />}<strong>{result.outcome === 'protected' ? 'Regression blocked' : result.outcome === 'recovered' ? 'Automated recovery' : result.outcome === 'blocked' ? 'Pipeline blocked' : 'Production impacted'}</strong></div><p>{result.message}</p><div className="pipeline-log-list">{result.logs.map((log, index) => <div key={`${log.stage}-${index}`}><span className={`log-status log-status--${log.status}`} /> <strong>{log.stage}</strong><small>{log.message}</small></div>)}</div></div>
}

function EvaluationPanel({ result, onRetry }: { result: SimulationResult; onRetry: () => void }) {
  const passed = result.outcome === 'pass'
  const conditional = result.outcome === 'conditional'
  return (
    <section className={`evaluation-panel evaluation-${result.outcome}`}>
      <div className="evaluation-status-icon">{passed ? <CheckCircle2 size={20} /> : conditional ? <AlertCircle size={20} /> : <ShieldAlert size={20} />}</div>
      <div className="evaluation-copy"><div className="evaluation-heading"><span>{passed ? 'SCENARIO CLEARED' : conditional ? 'CONDITIONAL PASS' : 'SIMULATION FAILED'}</span><strong>{result.summary}</strong></div><div className="evaluation-tags">{result.antiPatterns.length ? result.antiPatterns.map((item) => <span key={item.id} className={item.severity}><AlertCircle size={11} />{item.title}</span>) : <span className="evaluation-clean"><Check size={11} /> All topology checks passed</span>}<span className="reflection-prompt"><Sparkles size={11} /> {result.reflection}</span></div></div>
      <div className="evaluation-right"><span className="xp-pill"><Sparkles size={13} /> +{result.xp} XP</span><button className="retry-button" onClick={onRetry}>{passed ? 'Run again' : 'Refactor & retry'} <ArrowRight size={13} /></button></div>
      <div className="four-d-review"><div className="four-d-heading"><span>4D ARCHITECTURE REVIEW</span><small>DETERMINISTIC ADVISOR PREVIEW</small></div><div className="four-d-grid">{result.fourDReview.map((item) => <article key={item.dimension}><span>{item.dimension}</span><strong>{item.status}</strong><small>{item.detail}</small></article>)}</div></div>
    </section>
  )
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="dialog-head"><span className="dialog-symbol"><Sparkles size={17} /></span><button className="icon-button" onClick={onClose} aria-label="Close guide"><X size={16} /></button></div>
        <span className="dialog-eyebrow">QUICK GUIDE · NO PRIOR EXPERIENCE NEEDED</span><h2 id="help-title">What am I looking at?</h2><p>Start with the “Your challenge” guide above the canvas. It tells you what to change and gives you a button for each step.</p>
        <div className="guide-list">
          <div><span>01</span><div><strong>Nodes are building blocks</strong><small>Each card is a service, database, cache, or queue. Click one to edit its name, request capacity, and response time in the right-hand panel.</small></div></div>
          <div><span>02</span><div><strong>Lines show who talks to whom</strong><small>Drag from the small dot on one card to a dot on another. The arrow is the direction of a request. Click a line to choose HTTP, gRPC, or asynchronous AMQP.</small></div></div>
          <div><span>03</span><div><strong>Add or move components</strong><small>Click a component button above the canvas to add it. You can also drag that button onto the canvas, then move the new card into place.</small></div></div>
          <div><span>04</span><div><strong>Run the test when you are ready</strong><small>Click “Run stress test” at the top-right of the workspace. Traffic rises from 200 to 3,000 requests/second; node colors and the charts update while it runs.</small></div></div>
          <div><span>05</span><div><strong>Watch component health colors</strong><small>Green means healthy, amber means a component is nearing capacity, and red means it is overloaded. Gray means no test has run yet.</small></div></div>
          <div><span>06</span><div><strong>Read the score in plain language</strong><small>P95 means 95 out of 100 requests finish within that time. A good result keeps P95 under 300ms, errors under 1%, uptime at or above 99%, and has no critical design findings.</small></div></div>
        </div>
        <button className="dialog-action" onClick={onClose}>Back to workspace <ArrowRight size={14} /></button>
      </section>
    </div>
  )
}

export default App
