import { useCreateBlockNote, BlockNoteViewRaw } from "@blocknote/react";
import * as Y from "yjs";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/react/style.css";
import "./App.css";

// Create one Yjs document for the lifetime of the app.
// Y.Doc is the root container — it holds all shared data (blocks, metadata, etc.)
// We create it outside the component so it survives React re-renders.
const doc = new Y.Doc();

// getXmlFragment creates a named "slot" inside the Yjs document.
// BlockNote reads/writes all its block data into this fragment.
// The name "document" is arbitrary — you can use any string.
const fragment = doc.getXmlFragment("document");

function App() {
  // useCreateBlockNote initializes the BlockNote editor.
  // When `collaboration` is provided, BlockNote uses the Yjs fragment
  // as its storage backend instead of keeping blocks in local memory.
  // This means all edits are CRDT operations, ready for sync.
  // The empty [] deps means: create the editor only once on mount,
  // not on every render. Otherwise we'd lose our work on re-renders.
  const editor = useCreateBlockNote(
    {
      collaboration: {
        fragment: fragment,
        user: {
          name: "Me",
          color: "#f19837",
        },
      },
    },
    []
  );

  return (
    <BlockNoteViewRaw
      editor={editor}
      // Enable the slash menu (type "/" anywhere to insert blocks)
      slashMenu={true}
      // Enable the side menu (drag handle + add button on each block)
      sideMenu={true}
      // Enable the formatting toolbar (appears when selecting text)
      formattingToolbar={true}
    />
  );
}

export default App;
