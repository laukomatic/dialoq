import { useCreateBlockNote, BlockNoteViewRaw } from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/react/style.css";
import "./App.css";

function App() {
  const editor = useCreateBlockNote();

  return <BlockNoteViewRaw editor={editor} />;
}

export default App;
