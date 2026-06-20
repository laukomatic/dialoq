import { useState, useCallback, useEffect, useMemo } from "react";
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
  highlightedNodeIds?: string[];
};

type NoteNodeData = { label: string; highlighted?: boolean; tags?: string[] };
type NoteNode = Node<NoteNodeData>;

function scanLinks(doc: Y.Doc): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const fragments = Array.from(doc.share.keys()).filter(
    (k) => k !== "messages"
  );

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

function buildNodes(
  doc: Y.Doc,
  highlightedIds: string[] = [],
  searchQuery = "",
  tagFilter: string | null = null
): NoteNode[] {
  const archived = (doc.getArray("archived") as Y.Array<string>).toArray();
  const tagMap = doc.getMap("tags") as Y.Map<string[]>;
  const fragments = Array.from(doc.share.keys()).filter(
    (k) => k !== "messages" && !archived.includes(k)
  );

  const lowerQuery = searchQuery.toLowerCase().trim();

  const cols = 4;
  const spacingX = 280;
  const spacingY = 180;

  let idx = 0;
  return fragments.flatMap((name) => {
    const tags = tagMap.get(name) || [];
    const label = name;

    // Apply tag filter
    if (tagFilter && !tags.includes(tagFilter)) return [];

    // Apply text search
    const matchesSearch =
      !lowerQuery ||
      name.toLowerCase().includes(lowerQuery) ||
      tags.some((t) => t.toLowerCase().includes(lowerQuery));

    if (searchQuery && !matchesSearch) return [];

    const isHighlighted = highlightedIds.includes(name);
    const nodeIdx = idx++;

    return [
      {
        id: name,
        position: {
          x: 100 + (nodeIdx % cols) * spacingX + (Math.floor(nodeIdx / cols) % 2 === 0 ? 0 : 140),
          y: 80 + Math.floor(nodeIdx / cols) * spacingY,
        },
        data: { label, highlighted: isHighlighted, tags },
        type: "default",
        style: {
          background: isHighlighted
            ? "rgba(60, 120, 240, 0.3)"
            : "rgba(20, 30, 60, 0.85)",
          color: "#b8d4f0",
          border: isHighlighted
            ? "2px solid rgba(100, 180, 255, 0.8)"
            : "1px solid rgba(120, 160, 220, 0.3)",
          borderRadius: 12,
          padding: "10px 18px",
          fontSize: 13,
          fontWeight: 500,
          boxShadow: isHighlighted
            ? "0 0 20px rgba(100, 180, 255, 0.4), 0 0 40px rgba(100, 180, 255, 0.15)"
            : "none",
          transition: "all 0.4s ease",
          opacity: searchQuery && !matchesSearch ? 0.15 : 1,
        },
      } as NoteNode,
    ];
  });
}

function collectUniqueTags(doc: Y.Doc): string[] {
  const tagMap = doc.getMap("tags") as Y.Map<string[]>;
  const all = new Set<string>();
  for (const [, tags] of tagMap) {
    if (Array.isArray(tags)) tags.forEach((t) => all.add(t));
  }
  return Array.from(all).sort();
}

export function CanvasPanel({ doc, highlightedNodeIds = [] }: CanvasPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const allTags = useMemo(() => collectUniqueTags(doc), [doc]);

  const [nodes, setNodes, onNodesChange] = useNodesState<NoteNode>(
    buildNodes(doc, highlightedNodeIds, searchQuery, tagFilter)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const refreshNodes = useCallback(() => {
    setNodes(buildNodes(doc, highlightedNodeIds, searchQuery, tagFilter));
  }, [doc, highlightedNodeIds, searchQuery, tagFilter, setNodes]);

  useEffect(() => { refreshNodes(); }, [refreshNodes]);

  useEffect(() => {
    const update = () => refreshNodes();
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
    doc.getMap("tags").observeDeep(update);
    unsubs.push(() => doc.getMap("tags").unobserveDeep(update));
    doc.getArray("archived").observeDeep(update);
    unsubs.push(() => doc.getArray("archived").unobserveDeep(update));
    return () => unsubs.forEach((f) => f());
  }, [doc, refreshNodes]);

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
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {allTags.length > 0 && (
          <div className="canvas-tag-bar">
            <span className="canvas-tag-label">Tags:</span>
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
