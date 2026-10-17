import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import CustomStageNode from './CustomStageNode';
import InspectorDrawer from './InspectorDrawer';
import { extractBranches } from '../../parser/jenkinsfileParser';

const nodeTypes = {
  custom: CustomStageNode,
};

// Dagre layout sizing per shape
const LAYOUT_CONFIG = {
  circle: { nodeWidth: 180, nodeHeight: 160, nodesep: 50, ranksep: 120 },
  pill:   { nodeWidth: 260, nodeHeight: 100, nodesep: 70, ranksep: 160 },
};

const getLayoutedElements = (nodes, edges, direction = 'LR', shape = 'circle') => {
  const config = LAYOUT_CONFIG[shape] || LAYOUT_CONFIG.circle;
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: config.nodesep, ranksep: config.ranksep });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: config.nodeWidth, height: config.nodeHeight });
  });
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const isHorizontal = direction === 'LR';

  const layoutedNodes = nodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? 'left' : 'top';
    node.sourcePosition = isHorizontal ? 'right' : 'bottom';
    node.position = {
      x: pos.x - config.nodeWidth / 2,
      y: pos.y - config.nodeHeight / 2,
    };
    return { ...node };
  });

  return { layoutedNodes, layoutedEdges: edges };
};

// Edge styles
const DEFAULT_EDGE = { stroke: '#334155', strokeWidth: 2 };
const ACTIVE_EDGE = { stroke: '#22d3ee', strokeWidth: 3 };
const SKIPPED_EDGE = { stroke: '#1e293b', strokeWidth: 1.5 };

// Inner component that can use useReactFlow
const FlowchartInner = ({ ast }) => {
  const [layout, setLayout] = useState('LR');
  const [nodeShape, setNodeShape] = useState('circle');
  const [simulationBranch, setSimulationBranch] = useState('none');
  const [selectedStage, setSelectedStage] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const branchesList = useMemo(() => {
    const extracted = ast ? extractBranches(ast) : [];
    return Array.from(new Set(['main', 'develop', 'staging', ...extracted]));
  }, [ast]);

  // Transform AST → React Flow Nodes & Edges
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!ast || !ast.stages || !Array.isArray(ast.stages)) {
      return { initialNodes: [], initialEdges: [] };
    }

    const n = [];
    const e = [];
    let prevIds = [];

    const evaluateBranchMatch = (stage) => {
      if (simulationBranch === 'none') return false;
      if (!stage.when || stage.when.type !== 'branch') return false;
      const patterns = stage.when.branches || [stage.when.value];
      const isMatch = patterns.some((pattern) => {
        if (pattern.includes('*')) {
          const regexStr = pattern.replace(/\*/g, '.*');
          return new RegExp(`^${regexStr}$`).test(simulationBranch);
        }
        return pattern === simulationBranch;
      });
      return !isMatch;
    };

    // Start node
    n.push({
      id: 'start-node',
      type: 'custom',
      data: { stage: { name: 'Pipeline Start' }, isStart: true, nodeShape },
    });
    prevIds = ['start-node'];

    ast.stages.forEach((stage, idx) => {
      if (stage.parallel && Array.isArray(stage.parallel)) {
        const branchIds = [];
        stage.parallel.forEach((pStage, pIdx) => {
          const id = pStage.id || pStage.name || `parallel-${idx}-${pIdx}`;
          const skipped = evaluateBranchMatch(pStage);
          n.push({
            id,
            type: 'custom',
            data: { stage: pStage, nodeShape, isSkipped: skipped },
          });
          prevIds.forEach((prevId) => {
            e.push({
              id: `e-${prevId}-${id}`,
              source: prevId,
              target: id,
              type: 'smoothstep',
              animated: !skipped,
              style: skipped ? SKIPPED_EDGE : DEFAULT_EDGE,
              markerEnd: { type: MarkerType.ArrowClosed, color: skipped ? SKIPPED_EDGE.stroke : DEFAULT_EDGE.stroke },
            });
          });
          branchIds.push(id);
        });
        prevIds = branchIds;
      } else {
        const id = stage.id || stage.name || `stage-${idx}`;
        const skipped = evaluateBranchMatch(stage);
        n.push({
          id,
          type: 'custom',
          data: { stage, nodeShape, isSkipped: skipped },
        });
        prevIds.forEach((prevId) => {
          e.push({
            id: `e-${prevId}-${id}`,
            source: prevId,
            target: id,
            type: 'smoothstep',
            animated: !skipped,
            style: skipped ? SKIPPED_EDGE : DEFAULT_EDGE,
            markerEnd: { type: MarkerType.ArrowClosed, color: skipped ? SKIPPED_EDGE.stroke : DEFAULT_EDGE.stroke },
          });
        });
        prevIds = [id];
      }
    });

    return { initialNodes: n, initialEdges: e };
  }, [ast, nodeShape, simulationBranch]);

  // Apply layout
  useEffect(() => {
    if (initialNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const { layoutedNodes, layoutedEdges } = getLayoutedElements(initialNodes, initialEdges, layout, nodeShape);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [initialNodes, initialEdges, layout, nodeShape, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (event, node) => {
      if (node.id === 'start-node') return;
      setSelectedStage(node.data.stage);
      setEdges((eds) =>
        eds.map((e) => {
          if (e.source === node.id || e.target === node.id) {
            return { ...e, animated: true, style: ACTIVE_EDGE, markerEnd: { type: MarkerType.ArrowClosed, color: ACTIVE_EDGE.stroke } };
          }
          return { ...e, style: DEFAULT_EDGE, markerEnd: { type: MarkerType.ArrowClosed, color: DEFAULT_EDGE.stroke } };
        })
      );
    },
    [setEdges]
  );

  const handleCloseDrawer = () => {
    setSelectedStage(null);
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        style: DEFAULT_EDGE,
        markerEnd: { type: MarkerType.ArrowClosed, color: DEFAULT_EDGE.stroke },
      }))
    );
  };

  // Empty state
  if (!ast || !ast.stages || ast.stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 gap-4">
        <div className="w-20 h-20 rounded-full bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
          <span className="text-4xl opacity-30">🔍</span>
        </div>
        <p className="text-slate-500 text-sm font-medium">No pipeline stages detected. Paste a Jenkinsfile to visualize.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 relative overflow-hidden">
      {/* ── Floating Toolbar ── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-slate-900/90 backdrop-blur-xl rounded-full border border-slate-700/60 px-1.5 py-1 shadow-[0_4px_30px_rgba(0,0,0,0.6)]">

        {/* Branch Simulation */}
        <div className="flex items-center gap-1.5 px-3 border-r border-slate-700/40">
          <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          <select
            value={simulationBranch}
            onChange={(e) => setSimulationBranch(e.target.value)}
            className="bg-transparent text-xs text-slate-300 font-medium focus:outline-none cursor-pointer appearance-none pr-4"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center', backgroundSize: '16px' }}
          >
            <option value="none">All Branches</option>
            {branchesList.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Shape toggle */}
        <div className="flex items-center gap-0.5 px-1.5 border-r border-slate-700/40">
          <button
            onClick={() => setNodeShape('pill')}
            title="Pill nodes"
            className={`p-1.5 rounded-full transition-all ${nodeShape === 'pill' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="7" width="18" height="10" rx="5" /></svg>
          </button>
          <button
            onClick={() => setNodeShape('circle')}
            title="Circle nodes (Blue Ocean)"
            className={`p-1.5 rounded-full transition-all ${nodeShape === 'circle' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>
          </button>
        </div>

        {/* Layout direction */}
        <div className="flex items-center gap-0.5 px-1.5">
          <button
            onClick={() => setLayout('LR')}
            title="Horizontal layout"
            className={`p-1.5 rounded-full transition-all ${layout === 'LR' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
          <button
            onClick={() => setLayout('TB')}
            title="Vertical layout"
            className={`p-1.5 rounded-full transition-all ${layout === 'TB' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M12 5v14M6 13l6 6 6-6" /></svg>
          </button>
        </div>
      </div>

      {/* ── React Flow Canvas ── */}
      <div className="flex-1 w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: 30, y: 50, zoom: 0.75 }}
          minZoom={0.1}
          maxZoom={2}
          className="bg-slate-950"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1e293b" gap={24} size={1.5} />
          <Controls
            showInteractive={false}
          />
          <MiniMap
            nodeColor={(n) => {
              if (n.data?.isSkipped) return '#1e293b';
              if (n.data?.isStart) return '#22d3ee';
              return '#475569';
            }}
            maskColor="rgba(2, 6, 23, 0.75)"
          />
        </ReactFlow>
      </div>

      {/* ── Inspector Drawer ── */}
      {selectedStage && (
        <>
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
            onClick={handleCloseDrawer}
          />
          <InspectorDrawer stage={selectedStage} onClose={handleCloseDrawer} />
        </>
      )}
    </div>
  );
};

// Wrapper to provide ReactFlowProvider
const FlowchartTab = ({ ast }) => {
  return (
    <ReactFlowProvider>
      <FlowchartInner ast={ast} />
    </ReactFlowProvider>
  );
};

export default FlowchartTab;
