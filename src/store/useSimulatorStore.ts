import { create } from 'zustand'
import { defaultPipeline, initialEdges, initialNodes } from '../data/scenario'
import type { DiagramEdge, DiagramNode, NodeKind, PipelineResult, PipelineStage, SimulationResult } from '../types'

type CanvasTab = 'architecture' | 'pipeline'
type ModuleId = 'monolith' | 'data' | 'devops' | 'agents'
type Position = { x: number; y: number }

type SimulatorState = {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  activeModule: ModuleId
  canvasTab: CanvasTab
  selectedNodeId: string | null
  selectedEdgeId: string | null
  isRunning: boolean
  simulationProgress: number
  currentMetric: SimulationResult['peak'] | null
  simulationResult: SimulationResult | null
  pipelineStages: PipelineStage[]
  pipelineStrategy: 'canary' | 'blue-green'
  canaryTraffic: number
  rollbackThreshold: number
  rollbackEnabled: boolean
  pipelineRunning: boolean
  pipelineResult: PipelineResult | null
  apiOnline: boolean
  setNodes: (updater: DiagramNode[] | ((nodes: DiagramNode[]) => DiagramNode[])) => void
  setEdges: (updater: DiagramEdge[] | ((edges: DiagramEdge[]) => DiagramEdge[])) => void
  setActiveModule: (module: ModuleId) => void
  setCanvasTab: (tab: CanvasTab) => void
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  addNode: (kind: NodeKind, position?: Position) => string
  updateNodeData: (id: string, patch: Partial<DiagramNode['data']>) => void
  updateEdgeProtocol: (id: string, protocol: DiagramEdge['data']['protocol']) => void
  setIsRunning: (running: boolean) => void
  setSimulationProgress: (progress: number) => void
  setCurrentMetric: (metric: SimulationResult['peak'] | null) => void
  setSimulationResult: (result: SimulationResult | null) => void
  setPipelineStages: (updater: PipelineStage[] | ((stages: PipelineStage[]) => PipelineStage[])) => void
  setPipelineOptions: (options: Partial<Pick<SimulatorState, 'pipelineStrategy' | 'canaryTraffic' | 'rollbackThreshold' | 'rollbackEnabled'>>) => void
  setPipelineRunning: (running: boolean) => void
  setPipelineResult: (result: PipelineResult | null) => void
  setApiOnline: (online: boolean) => void
  reset: () => void
}

const nodeDefaults: Record<NodeKind, { label: string; capacity: number; latency: number; description: string }> = {
  traffic: { label: 'Traffic source', capacity: 5000, latency: 8, description: 'Synthetic request generator' },
  gateway: { label: 'API Gateway', capacity: 3600, latency: 18, description: 'Rate limiting + edge routing' },
  service: { label: 'New service', capacity: 2000, latency: 35, description: 'Independent service boundary' },
  database: { label: 'Service DB', capacity: 2200, latency: 24, description: 'Isolated persistence layer' },
  cache: { label: 'Redis Cache', capacity: 4200, latency: 4, description: 'Hot reads · 70% hit rate' },
  broker: { label: 'Event Broker', capacity: 4000, latency: 12, description: 'Asynchronous AMQP events' },
  circuitBreaker: { label: 'Circuit Breaker', capacity: 5000, latency: 2, description: 'Timeout 800ms · 5 failures' },
  pipeline: { label: 'CI/CD Pipeline', capacity: 0, latency: 0, description: 'Automated delivery workflow' },
  cluster: { label: 'Production Cluster', capacity: 3200, latency: 20, description: 'Blue / green runtime pool' },
}

export const useSimulatorStore = create<SimulatorState>((set) => ({
  nodes: initialNodes,
  edges: initialEdges,
  activeModule: 'monolith',
  canvasTab: 'architecture',
  selectedNodeId: 'database',
  selectedEdgeId: null,
  isRunning: false,
  simulationProgress: 0,
  currentMetric: null,
  simulationResult: null,
  pipelineStages: defaultPipeline,
  pipelineStrategy: 'canary',
  canaryTraffic: 10,
  rollbackThreshold: 2,
  rollbackEnabled: true,
  pipelineRunning: false,
  pipelineResult: null,
  apiOnline: false,
  setNodes: (updater) => set((state) => ({ nodes: typeof updater === 'function' ? updater(state.nodes) : updater })),
  setEdges: (updater) => set((state) => ({ edges: typeof updater === 'function' ? updater(state.edges) : updater })),
  setActiveModule: (activeModule) => set({ activeModule }),
  setCanvasTab: (canvasTab) => set({ canvasTab, selectedEdgeId: null }),
  selectNode: (selectedNodeId) => set({ selectedNodeId, selectedEdgeId: null }),
  selectEdge: (selectedEdgeId) => set({ selectedEdgeId, selectedNodeId: null }),
  addNode: (kind, position) => {
    const id = `${kind}-${Date.now().toString(36)}`
    const defaults = nodeDefaults[kind]
    set((state) => ({
      nodes: [...state.nodes, {
        id,
        type: 'service',
        position: position || { x: 570 + (state.nodes.length % 3) * 62, y: 430 + (state.nodes.length % 4) * 42 },
        data: { ...defaults, kind, health: 'idle' },
      }],
      selectedNodeId: id,
      selectedEdgeId: null,
      simulationResult: null,
    }))
    return id
  },
  updateNodeData: (id, patch) => set((state) => ({ nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node) })),
  updateEdgeProtocol: (id, protocol) => set((state) => ({ edges: state.edges.map((edge) => edge.id === id ? { ...edge, label: protocol, data: { protocol } } : edge) })),
  setIsRunning: (isRunning) => set({ isRunning }),
  setSimulationProgress: (simulationProgress) => set({ simulationProgress }),
  setCurrentMetric: (currentMetric) => set({ currentMetric }),
  setSimulationResult: (simulationResult) => set({ simulationResult }),
  setPipelineStages: (updater) => set((state) => ({ pipelineStages: typeof updater === 'function' ? updater(state.pipelineStages) : updater })),
  setPipelineOptions: (options) => set(options),
  setPipelineRunning: (pipelineRunning) => set({ pipelineRunning }),
  setPipelineResult: (pipelineResult) => set({ pipelineResult }),
  setApiOnline: (apiOnline) => set({ apiOnline }),
  reset: () => set({
    nodes: initialNodes,
    edges: initialEdges,
    selectedNodeId: 'database',
    selectedEdgeId: null,
    isRunning: false,
    simulationProgress: 0,
    currentMetric: null,
    simulationResult: null,
    pipelineStages: defaultPipeline,
    pipelineStrategy: 'canary',
    canaryTraffic: 10,
    rollbackThreshold: 2,
    rollbackEnabled: true,
    pipelineRunning: false,
    pipelineResult: null,
  }),
}))
