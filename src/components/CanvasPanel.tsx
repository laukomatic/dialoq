import { useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
} from "@xyflow/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import * as Y from "yjs";
import { extractWikilinks } from "../utils/links";
import "@xyflow/react/dist/style.css";
import "@blocknote/mantine/style.css";

type CanvasPanelProps = {
  doc: Y.Doc;
};

type NoteNodeData = { label: string };
type NoteNode = Node<NoteNodeData>;

function scanLinks(doc: Y.Doc): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const fragments = Array.from(doc.share.keys()).filter(
    (k) => k !== "messages"
  );

  // Seed edges — show relationships between sample notes.
  const seeds: [string, string][] = [
    ["inbox", "ideas"],
    ["inbox", "projects"],
    ["ideas", "research"],
    ["ideas", "projects"],
    ["projects", "project-alpha"],
    ["projects", "project-beta"],
    ["research", "learning"],
    ["research", "project-alpha"],
    ["research", "ideas"],
    ["personal", "ideas"],
    ["meetings", "project-alpha"],
    ["meetings", "project-beta"],
    ["learning", "research"],
  ];

  for (const [source, target] of seeds) {
    if (!fragments.includes(source) || !fragments.includes(target)) continue;
    const id = `seed-${source}->${target}`;
    if (!seen.has(id)) {
      seen.add(id);
      edges.push(edge(source, target, id));
    }
  }

  // Dynamic edges from [[wikilinks]] in fragment content.
  for (const fragName of fragments) {
    try {
      const frag = doc.getXmlFragment(fragName);
      const text = frag.toString();
      for (const link of extractWikilinks(text)) {
        const id = `dyn-${fragName}->${link.noteId}`;
        if (!seen.has(id) && fragments.includes(link.noteId)) {
          seen.add(id);
          edges.push(edge(fragName, link.noteId, id));
        }
      }
    } catch { /* skip */ }
  }

  return edges;
}

function edge(source: string, target: string, id: string): Edge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    animated: false,
    style: { stroke: "rgba(136, 180, 230, 0.45)", strokeWidth: 1.5 },
  };
}

function buildNodes(doc: Y.Doc): NoteNode[] {
  const fragments = Array.from(doc.share.keys()).filter(
    (k) => k !== "messages"
  );
  // Spread nodes in a wider, more organic pattern.
  const cols = 4;
  const spacingX = 280;
  const spacingY = 180;
  return fragments.map((name, i) => ({
    id: name,
    position: {
      x: 100 + (i % cols) * spacingX + (Math.floor(i / cols) % 2 === 0 ? 0 : 140),
      y: 80 + Math.floor(i / cols) * spacingY,
    },
    data: { label: name },
    type: "default",
    style: {
      background: "rgba(20, 30, 60, 0.85)",
      color: "#b8d4f0",
      border: "1px solid rgba(120, 160, 220, 0.3)",
      borderRadius: 12,
      padding: "10px 18px",
      fontSize: 13,
      fontWeight: 500,
    },
  }));
}

export function CanvasPanel({ doc }: CanvasPanelProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<NoteNode>(buildNodes(doc));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Update nodes when fragments change.
  useEffect(() => {
    const update = () => setNodes(buildNodes(doc));
    update();
    const unsubs: (() => void)[] = [];
    for (const name of doc.share.keys()) {
      try {
        const f = doc.getXmlFragment(name);
        f.observeDeep(update);
        unsubs.push(() => f.unobserveDeep(update));
      } catch { /* skip */ }
    }
    doc.getArray("messages").observeDeep(update);
    unsubs.push(() => doc.getArray("messages").unobserveDeep(update));
    return () => unsubs.forEach((f) => f());
  }, [doc, setNodes]);

  // Update edges from wikilinks.
  useEffect(() => {
    const update = () => setEdges(scanLinks(doc));
    update();
    const unsubs: (() => void)[] = [];
    for (const name of doc.share.keys()) {
      try {
        const f = doc.getXmlFragment(name);
        f.observeDeep(update);
        unsubs.push(() => f.unobserveDeep(update));
      } catch { /* skip */ }
    }
    return () => unsubs.forEach((f) => f());
  }, [doc, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: NoteNode) => {
      setSelectedNode(node.id);
    },
    []
  );

  const activeFragment = (() => {
    if (!selectedNode) return null;
    try {
      return doc.getXmlFragment(selectedNode);
    } catch {
      return null;
    }
  })();

  return (
    <div className="canvas-fullscreen">
      <div className="canvas-search-float">
        <input
          className="canvas-search-float-input"
          placeholder="Search all notes..."
          disabled
        />
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.4, duration: 800 }}
        style={{ background: "transparent" }}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { stroke: "rgba(136, 180, 230, 0.35)", strokeWidth: 1.5 },
        }}
      >
        <Background color="rgba(255,255,255,0.04)" gap={32} size={1} />
        <Controls
          style={{
            background: "rgba(20, 30, 60, 0.7)",
            border: "1px solid rgba(120, 160, 220, 0.2)",
            borderRadius: 8,
          }}
        />
      </ReactFlow>

      {selectedNode && activeFragment && (
        <FloatingNoteEditor
          fragment={activeFragment}
          title={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

function FloatingNoteEditor({
  fragment,
  title,
  onClose,
}: {
  fragment: Y.XmlFragment;
  title: string;
  onClose: () => void;
}) {
  const editor = useCreateBlockNote(
    {
      collaboration: {
        fragment,
        user: { name: "AI", color: "#4dabf7" },
      },
    },
    [fragment]
  );

  return (
    <div className="floating-editor">
      <div className="floating-editor-header">
        <span className="floating-editor-title">{title}</span>
        <button className="floating-editor-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="floating-editor-body">
        {editor && <BlockNoteView editor={editor} />}
      </div>
    </div>
  );
}
