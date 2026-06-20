import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export function computeLayout(
  nodeIds: string[],
  edges: LayoutEdge[],
  width = 800,
  height = 600
): LayoutNode[] {
  if (nodeIds.length === 0) return [];

  const nodes = nodeIds.map((id) => ({ id, x: 0, y: 0 }));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const linkEdges = edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  const sim = forceSimulation(nodes)
    .force(
      "link",
      forceLink(linkEdges)
        .id((d: any) => d.id)
        .distance(200)
    )
    .force("charge", forceManyBody().strength(-400))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide(80))
    .stop();

  // Run simulation to stabilization
  for (let i = 0; i < 150; i++) sim.tick();

  // Normalize to viewport bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const pad = 80;

  return nodes.map((n) => ({
    id: n.id,
    x: pad + ((n.x - minX) / rangeX) * (width - 2 * pad),
    y: pad + ((n.y - minY) / rangeY) * (height - 2 * pad),
  }));
}
