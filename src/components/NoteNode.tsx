import { type NodeProps } from "@xyflow/react";

export type NoteNodeData = {
  label: string;
  preview: string;
  relevance: number;
  highlighted: boolean;
  connections: number;
};

export default function NoteNode({ data }: NodeProps) {
  const d = data as unknown as NoteNodeData;
  const { label, preview, relevance, highlighted, connections } = d;

  const showFull = relevance >= 0.8;
  const showPreview = relevance >= 0.5;

  return (
    <div
      className={`note-node ${showFull ? "note-node--full" : showPreview ? "note-node--preview" : "note-node--compact"} ${highlighted ? "note-node--highlighted" : ""}`}
    >
      <div className="note-node__title">{label}</div>

      {showPreview && preview && (
        <div className="note-node__content">{preview}</div>
      )}

      {connections > 0 && (
        <div className="note-node__meta">
          {connections} connection{connections !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
