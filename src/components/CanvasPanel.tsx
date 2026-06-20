import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { computeLayout } from "../utils/layout";
import NoteNode, { type NoteNodeData } from "./NoteNode";
import "@xyflow/react/dist/style.css";
import "@blocknote/mantine/style.css";

type CanvasPanelProps = {
  doc: Y.Doc;
  highlightedNodeIds?: string[];
};

type NoteNode = Node<NoteNodeData>;

const NOTE_EXCLUDE = new Set(["messages", "archived", "tags"]);

function noteFragments(doc: Y.Doc): string[] {
  return Array.from(doc.share.keys()).filter((k) => !NOTE_EXCLUDE.has(k));
}

function scanLinks(doc: Y.Doc): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const fragments = noteFragments(doc);

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
    style: { stroke: "rgba(136, 180, 230, 0.35)", strokeWidth: 1.5 },
  };
}

function extractFragmentText(frag: Y.XmlFragment): string {
  const parts: string[] = [];
  for (const child of frag.toArray()) {
    if (child instanceof Y.XmlText) {
      parts.push(child.toString());
    } else if (child instanceof Y.XmlElement) {
      parts.push(extractElementText(child));
    }
  }
  return parts.join("\n").trim();
}

function extractElementText(el: Y.XmlElement): string {
  const parts: string[] = [];
  for (const child of el.toArray()) {
    if (child instanceof Y.XmlText) {
      parts.push(child.toString());
    } else if (child instanceof Y.XmlElement) {
      const nested = extractElementText(child);
      if (nested) parts.push(nested);
    }
  }
  return parts.join(" ");
}

function extractPreview(frag: Y.XmlFragment): string {
  return extractFragmentText(frag).replace(/\s+/g, " ").trim().slice(0, 200);
}

function computeRelevance(
  nodeId: string,
  focusId: string | null,
  edges: Edge[]
): number {
  if (!focusId) return 0.6;
  if (nodeId === focusId) return 1.0;
  const isNeighbor = edges.some(
    (e) =>
      (e.source === focusId && e.target === nodeId) ||
      (e.source === nodeId && e.target === focusId)
  );
  if (isNeighbor) return 0.8;
  return 0.3;
}

function buildNodeData(
  doc: Y.Doc,
  focusId: string | null,
  edges: Edge[],
  highlightedIds: string[]
): NoteNodeData[] {
  const archived = new Set(
    (doc.getArray("archived") as Y.Array<string>).toArray()
  );
  const fragments = noteFragments(doc).filter((k) => !archived.has(k));

  return fragments.map((name) => {
    let preview = "";
    try {
      const frag = doc.getXmlFragment(name);
      preview = extractPreview(frag);
    } catch { /* empty */ }

    const connectionCount = edges.filter(
      (e) => e.source === name || e.target === name
    ).length;

    return {
      label: name,
      preview,
      relevance: computeRelevance(name, focusId, edges),
      highlighted: highlightedIds.includes(name),
      connections: connectionCount,
    };
  });
}

function toReactFlowNode(
  data: NoteNodeData,
  pos: { x: number; y: number }
): NoteNode {
  const rel = data.relevance;
  const dimmed = rel < 0.5;

  return {
    id: data.label,
    position: pos,
    data,
    type: "note",
    style: {
      opacity: dimmed ? 0.3 : rel >= 0.8 ? 1 : 0.7,
      transition: "opacity 0.4s ease",
    },
  };
}

const nodeTypes = { note: NoteNode };

export function CanvasPanel({ doc, highlightedNodeIds = [] }: CanvasPanelProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<NoteNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const tagMap = doc.getMap("tags") as Y.Map<string[]>;
    const all = new Set<string>();
    for (const [, tags] of tagMap) {
      if (Array.isArray(tags)) tags.forEach((t) => all.add(t));
    }
    return Array.from(all).sort();
  }, [doc]);

  // Keyboard shortcut: Ctrl+K / Cmd+K to focus search
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Full rebuild: compute layout when note set changes
  useEffect(() => {
    const newEdges = scanLinks(doc);
    setEdges(newEdges);

    const data = buildNodeData(doc, focusId, newEdges, highlightedNodeIds);
    if (data.length === 0) {
      setNodes([]);
      return;
    }

    const positioned = computeLayout(
      data.map((d) => d.label),
      newEdges.map((e) => ({ source: e.source, target: e.target })),
      window.innerWidth,
      window.innerHeight
    );

    const posMap = new Map(positioned.map((p) => [p.id, { x: p.x, y: p.y }]));
    setNodes(data.map((d) => toReactFlowNode(d, posMap.get(d.label) || { x: 0, y: 0 })));
  }, [doc]);

  // Update relevance when focus changes (keep positions)
  useEffect(() => {
    setNodes((prev) => {
      const data = buildNodeData(doc, focusId, edges, highlightedNodeIds);
      const dataMap = new Map(data.map((d) => [d.label, d]));
      return prev.map((n) => {
        const d = dataMap.get(n.id);
        if (!d) return n;
        return toReactFlowNode(d, n.position);
      });
    });
  }, [focusId, highlightedNodeIds]);

  // Handle node clicks: focus + open editor
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: NoteNode) => {
      setFocusId((prev) => (prev === node.id ? null : node.id));
      setSelectedNode(node.id);
    },
    []
  );

  // Re-layout on window resize
  useEffect(() => {
    const onResize = () => {
      const data = buildNodeData(doc, focusId, edges, highlightedNodeIds);
      if (data.length === 0) return;
      const positioned = computeLayout(
        data.map((d) => d.label),
        edges.map((e) => ({ source: e.source, target: e.target })),
        window.innerWidth,
        window.innerHeight
      );
      const posMap = new Map(positioned.map((p) => [p.id, { x: p.x, y: p.y }]));
      setNodes((prev) =>
        prev.map((n) => ({
          ...n,
          position: posMap.get(n.id) || n.position,
        }))
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [doc, focusId, edges, highlightedNodeIds]);

  // Observe Yjs changes to re-build + re-layout
  useEffect(() => {
    const rebuild = () => {
      const newEdges = scanLinks(doc);
      setEdges(newEdges);

      const data = buildNodeData(doc, focusId, newEdges, highlightedNodeIds);
      if (data.length === 0) {
        setNodes([]);
        return;
      }
      const positioned = computeLayout(
        data.map((d) => d.label),
        newEdges.map((e) => ({ source: e.source, target: e.target })),
        window.innerWidth,
        window.innerHeight
      );
      const posMap = new Map(positioned.map((p) => [p.id, { x: p.x, y: p.y }]));
      setNodes(data.map((d) => toReactFlowNode(d, posMap.get(d.label) || { x: 0, y: 0 })));
    };

    const unsubs: (() => void)[] = [];
    for (const name of doc.share.keys()) {
      try {
        const f = doc.getXmlFragment(name);
        f.observeDeep(rebuild);
        unsubs.push(() => f.unobserveDeep(rebuild));
      } catch { /* skip */ }
    }
    doc.getArray("messages").observeDeep(rebuild);
    unsubs.push(() => doc.getArray("messages").unobserveDeep(rebuild));
    doc.getMap("tags").observeDeep(rebuild);
    unsubs.push(() => doc.getMap("tags").unobserveDeep(rebuild));
    doc.getArray("archived").observeDeep(rebuild);
    unsubs.push(() => doc.getArray("archived").unobserveDeep(rebuild));

    return () => unsubs.forEach((f) => f());
  }, [doc, focusId, highlightedNodeIds]);

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
          ref={searchRef}
          className="canvas-search-float-input"
          placeholder={tagFilter ? `Filtered by: #${tagFilter}` : "Search notes or #tag..."}
          value={searchQuery}
          onChange={(e) => {
            const val = e.target.value;
            if (val.startsWith("#")) {
              setTagFilter(val.slice(1) || null);
              setSearchQuery("");
            } else {
              setSearchQuery(val);
              setTagFilter(null);
            }
          }}
        />
        {allTags.length > 0 && (
          <div className="canvas-tag-bar">
            {allTags.map((tag) => (
              <button
                key={tag}
                className={`canvas-tag-pill ${tagFilter === tag ? "canvas-tag-pill--active" : ""}`}
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.3, duration: 600 }}
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
