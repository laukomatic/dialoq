import { useState, useCallback } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import * as Y from "yjs";
import "@xyflow/react/dist/style.css";
import "@blocknote/mantine/style.css";

type CanvasPanelProps = {
  fragment: Y.XmlFragment;
};

type NoteNode = Node<{ label: string }>;

const initialNodes: NoteNode[] = [
  {
    id: "inbox",
    position: { x: 400, y: 200 },
    data: { label: "Inbox" },
    type: "default",
  },
  {
    id: "project-alpha",
    position: { x: 150, y: 350 },
    data: { label: "Project Alpha" },
    type: "default",
  },
  {
    id: "meeting-notes",
    position: { x: 650, y: 350 },
    data: { label: "Meeting Notes" },
    type: "default",
  },
];

const initialEdges: Edge[] = [
  { id: "e-1", source: "inbox", target: "project-alpha" },
  { id: "e-2", source: "inbox", target: "meeting-notes" },
];

export function CanvasPanel({ fragment }: CanvasPanelProps) {
  const [nodes, , onNodesChange] = useNodesState<NoteNode>(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: NoteNode) => {
      setSelectedNode(node.id);
    },
    []
  );

  return (
    <div className="panel canvas-panel">
      <div className="canvas-search-bar">
        <input
          className="canvas-search-input"
          placeholder="Search notes..."
          disabled
        />
      </div>

      <div className="canvas-main">
        <div className="canvas-graph">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        <div className="canvas-detail">
          {selectedNode ? (
            <NoteEditor
              fragment={fragment}
              title={nodes.find((n) => n.id === selectedNode)?.data.label ?? ""}
            />
          ) : (
            <div className="canvas-detail-empty">
              Click a node to view its content
            </div>
          )}
        </div>
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

  return (
    <div className="note-editor">
      <div className="note-editor-header">{title}</div>
      <div className="note-editor-body">
        <BlockNoteView editor={editor} />
      </div>
    </div>
  );
}
