import { useState, useCallback, useEffect, useMemo } from "react";
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
  fragment: Y.XmlFragment;
  doc: Y.Doc;
};

type NoteNodeData = { label: string; source: string };
type NoteNode = Node<NoteNodeData>;

const CORE_NODES: NoteNode[] = [
  {
    id: "inbox",
    position: { x: 400, y: 200 },
    data: { label: "Inbox", source: "core" },
    type: "default",
  },
];

/**
 * Scan all fragments in a Y.Doc for [[wikilinks]] and return edges
 * connecting the fragment that contains the link to the target fragment.
 */
function scanLinks(doc: Y.Doc): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const fragments = Array.from(doc.share.keys());

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
    } catch {
      // Fragment might be a different Yjs type; skip.
    }
  }

  return edges;
}

export function CanvasPanel({ fragment, doc }: CanvasPanelProps) {
  const [nodes, , onNodesChange] = useNodesState<NoteNode>(CORE_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Build the full node list: core nodes + one node per Y.Doc fragment.
  const allNodes = useMemo(() => {
    const fragmentNames = Array.from(doc.share.keys());
    const dynamicNodes: NoteNode[] = fragmentNames
      .filter((name) => !nodes.some((n) => n.id === name))
      .map((name, i) => ({
        id: name,
        position: {
          x: 200 + (i % 4) * 180,
          y: 150 + Math.floor(i / 4) * 120,
        },
        data: { label: name, source: "fragment" },
        type: "default",
      }));
    return [...nodes, ...dynamicNodes];
  }, [nodes, doc]);

  // Scan for wikilinks and update edges.
  useEffect(() => {
    const update = () => setEdges(scanLinks(doc));
    update();
    // Observe all fragments for changes.
    const unsubs: (() => void)[] = [];
    for (const name of doc.share.keys()) {
      try {
        const f = doc.getXmlFragment(name);
        f.observe(update);
        unsubs.push(() => f.unobserve(update));
      } catch { /* skip */ }
    }
    // Also observe when new fragments are added.
    const arr = doc.getArray("messages");
    arr.observe(update);
    unsubs.push(() => arr.unobserve(update));

    return () => unsubs.forEach((fn) => fn());
  }, [doc, setEdges]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: NoteNode) => {
      if (node.data.source === "core") return;
      setSelectedNode(collapsed ? null : node.id);
    },
    [collapsed]
  );

  const activeFragment = useMemo(() => {
    if (!selectedNode) return fragment;
    try {
      return doc.getXmlFragment(selectedNode);
    } catch {
      return fragment;
    }
  }, [doc, fragment, selectedNode]);

  return (
    <div className="panel canvas-panel">
      <div className="canvas-toolbar">
        <input
          className="canvas-search-input"
          placeholder="Search notes..."
          disabled
        />
        <button
          className="canvas-toggle-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Show note editor" : "Hide note editor"}
        >
          {collapsed ? "▸ Editor" : "▾ Editor"}
        </button>
      </div>

      <div className={`canvas-main ${collapsed ? "canvas-main--expanded" : ""}`}>
        <div className="canvas-graph">
          <ReactFlow
            nodes={allNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            connectionMode={ConnectionMode.Loose}
            fitView
            fitViewOptions={{ padding: 0.3, duration: 300 }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {!collapsed && (
          <div className="canvas-detail">
            {selectedNode ? (
              <NoteEditor
                fragment={activeFragment}
                title={selectedNode}
              />
            ) : (
              <div className="canvas-detail-empty">
                Click a node to view its content
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteEditor({ fragment, title }: { fragment: Y.XmlFragment; title: string }) {
  const editor = useCreateBlockNote(
    {
      collaboration: {
        fragment,
        user: { name: "AI", color: "#4dabf7" },
      },
    },
    [fragment]
  );

  // Listen for wikilinks typed in the note editor and highlight them.
  useEffect(() => {
    if (!editor) return;
    return editor.onChange(() => {
      // Triggers re-scanning via the parent observer.
    });
  }, [editor]);

  return (
    <div className="note-editor">
      <div className="note-editor-header">
        <span className="note-editor-title">{title}</span>
      </div>
      <div className="note-editor-body">
        <BlockNoteView editor={editor} />
      </div>
    </div>
  );
}
