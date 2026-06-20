import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import * as Y from "yjs";
import "@blocknote/mantine/style.css";

type CanvasPanelProps = {
  fragment: Y.XmlFragment;
};

export function CanvasPanel({ fragment }: CanvasPanelProps) {
  const editor = useCreateBlockNote(
    {
      collaboration: {
        fragment,
        user: { name: "AI", color: "#4dabf7" },
      },
    },
    []
  );

  return (
    <div className="panel canvas-panel">
      <div className="panel-header">Canvas</div>
      <div className="panel-body">
        <BlockNoteView editor={editor} />
      </div>
    </div>
  );
}
