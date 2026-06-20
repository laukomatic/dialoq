import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import * as Y from "yjs";
import "@blocknote/mantine/style.css";

type ChatPanelProps = {
  fragment: Y.XmlFragment;
};

export function ChatPanel({ fragment }: ChatPanelProps) {
  const editor = useCreateBlockNote(
    {
      collaboration: {
        fragment,
        user: { name: "Me", color: "#f19837" },
      },
    },
    []
  );

  return (
    <div className="panel chat-panel">
      <div className="panel-header">Chat</div>
      <div className="panel-body">
        <BlockNoteView
          editor={editor}
          formattingToolbar={false}
          sideMenu={false}
        />
      </div>
    </div>
  );
}
