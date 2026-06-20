import { useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
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

  for (const fragName of fragments) {
    try {
      const frag = doc.getXmlFragment(fragName);
      const text = frag.toString();
      for (const link of extractWikilinks(text)) {
        const edgeId = `${fragName}->${link.noteId}`;
        if (!seen.has(edgeId) && fragments.includes(link.noteId)) {
          seen.add(edgeId);
          edges.push({
            id: edgeId,
            source: fragName,
            target: link.noteId,
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "#4dabf7", strokeWidth: 2 },
          });
        }
      }
    } catch { /* skip */ }
  }
  return edges;
}

function buildNodes(doc: Y.Doc): NoteNode[] {
  const fragments = Array.from(doc.share.keys()).filter(
    (k) => k !== "messages"
  );
  return fragments.map((name, i) => ({
    id: name,
    position: {
      x: 200 + (i % 5) * 200,
      y: 100 + Math.floor(i / 5) * 150,
    },
    data: { label: name },
    type: "default",
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
    (_event: React.MouseEvent, node: NoteNode) => {
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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.3, duration: 500 }}
      >
        <Background />
        <Controls />
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
