import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import * as Y from "yjs";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";
import "./App.css";

// One Y.Doc per app session — holds all note fragments.
// Each fragment is a named "slot" inside the doc, identified by a key.
// "document" here is just the default inbox fragment.
// Later, each structured note will live in its own fragment (e.g. "note-abc123").
const doc = new Y.Doc();
const fragment = doc.getXmlFragment("document");

function App() {
  const editor = useCreateBlockNote(
    {
      collaboration: {
        fragment,
        user: { name: "Me", color: "#f19837" },
      },
    },
    []
  );

  // BlockNoteView from @blocknote/mantine includes built-in:
  // - slash menu (press "/")
  // - side menu (hover left of a block)
  // - formatting toolbar (select text)
  // No extra configuration needed.
  return <BlockNoteView editor={editor} />;
}

export default App;
