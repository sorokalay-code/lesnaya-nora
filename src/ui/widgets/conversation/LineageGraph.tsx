import dagre from '@dagrejs/dagre';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './LineageGraph.css';
import type {
  LineageGraphNode as LineageGraphNodeData,
  LineageGraphStatus,
  LineageGraphView,
} from '../../presenters/LineageGraphPresenter';

const NODE_WIDTH = 210;
const NODE_HEIGHT = 78;

type PersonFlowNode = Node<LineageGraphNodeData, 'person'>;

const statusLabels: Record<LineageGraphStatus, string> = {
  current: 'Ты сейчас играешь за неё',
  'former-player': 'Бывшая героиня',
  'living-family': 'Член семьи',
  deceased: 'Погибшая',
  partner: 'Партнёр',
  ancestor: 'Предок',
};

function PersonNode({ data }: NodeProps<PersonFlowNode>) {
  return (
    <article
      className={`lineage-node lineage-node--${data.status}${data.focused ? ' is-focused' : ''}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <b className="lineage-node-name">{data.name}</b>
      <span>{statusLabels[data.status]}</span>
      <small>Поколение {data.generation}</small>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </article>
  );
}

const nodeTypes: NodeTypes = { person: PersonNode };

function layoutGraph(graph: LineageGraphView): { nodes: PersonFlowNode[]; edges: Edge[] } {
  const layout = new dagre.graphlib.Graph();
  layout.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 56, marginx: 24, marginy: 24 });
  layout.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes)
    layout.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const edge of graph.edges) layout.setEdge(edge.source, edge.target);
  dagre.layout(layout);

  return {
    nodes: graph.nodes.map((node) => {
      const { x, y } = layout.node(node.id);
      return {
        id: node.id,
        type: 'person',
        data: node,
        position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        className: `lineage-flow-node lineage-flow-node--${node.status}${node.focused ? ' is-focused' : ''}`,
      };
    }),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--ui-accent)' },
      label: edge.distance > 1 ? `через ${edge.distance} пок.` : undefined,
      style: {
        stroke: 'var(--ui-accent)',
        strokeDasharray: edge.distance > 1 ? '5 4' : undefined,
      },
    })),
  };
}

export function LineageGraph({ graph }: { graph?: LineageGraphView }) {
  if (!graph?.nodes.length)
    return <p className="lineage-graph-empty">Для этой линии пока нет сохранённой родословной.</p>;

  const { nodes, edges } = layoutGraph(graph);
  return (
    <div className="lineage-graph">
      <ul className="lineage-graph-legend" aria-label="Обозначения">
        <li>
          <span className="lineage-legend-swatch is-current" /> Сейчас
        </li>
        <li>
          <span className="lineage-legend-swatch is-former" /> Бывшая героиня
        </li>
        <li>
          <span className="lineage-legend-swatch is-deceased" /> Погибшая
        </li>
        <li>Стрелка ведёт от предка к потомку</li>
      </ul>
      <div className="lineage-graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.25}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          ariaLabelConfig={{
            'controls.ariaLabel': 'Управление графом',
            'controls.zoomIn.ariaLabel': 'Приблизить',
            'controls.zoomOut.ariaLabel': 'Отдалить',
            'controls.fitView.ariaLabel': 'Показать весь граф',
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="lineage-graph-note">
        Родословная объединяет известных родителей и предков; пунктиром отмечены связи, для которых
        в сохранении нет полного промежуточного пути.
      </p>
    </div>
  );
}
