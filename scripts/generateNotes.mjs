import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const notesDir = join(
  process.env.USERPROFILE,
  "Documents",
  "DigitalMind",
  "DigitalMind",
  "Notes"
);

const allFiles = readdirSync(notesDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ name: f, mtime: statSync(join(notesDir, f)).mtime }))
  .sort((a, b) => b.mtime - a.mtime)
  .slice(0, 20);

const notes = allFiles.map(({ name }) => {
  const raw = readFileSync(join(notesDir, name), "utf-8");
  const content = raw.replace(/^---[\s\S]*?---\n*/m, "").trim();
  const title = name.replace(/\.md$/, "");
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  let tags = [];
  if (fmMatch) {
    const tagMatch = fmMatch[1].match(/tags:\s*\[([^\]]*)\]/);
    if (tagMatch) {
      tags = tagMatch[1]
        .split(",")
        .map((t) => t.trim().replace(/['"]/g, ""))
        .filter(Boolean);
    }
  }
  const hashTags = [...content.matchAll(/#([a-z][a-z0-9_-]*)/gi)].map(
    (m) => m[1].toLowerCase()
  );
  tags = [...new Set([...tags, ...hashTags])].slice(0, 5);

  return { id, title, content, tags };
});

const ts =
  '// Auto-generated from DigitalMind notes\n\nexport const digitalMindNotes = ' +
  JSON.stringify(notes, null, 2) +
  ";\n";

writeFileSync(join(import.meta.dirname, "..", "src", "assets", "digitalMindNotes.ts"), ts, "utf-8");
console.log(`Generated ${notes.length} notes -> src/assets/digitalMindNotes.ts`);
