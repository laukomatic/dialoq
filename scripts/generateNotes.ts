const fs = require("fs");
const path = require("path");

const notesDir = path.join(process.env.USERPROFILE, "Documents", "DigitalMind", "DigitalMind", "Notes");

const files = fs.readdirSync(notesDir)
  .filter(f => f.endsWith(".md"))
  .map(f => ({ name: f, mtime: fs.statSync(path.join(notesDir, f)).mtime }))
  .sort((a, b) => b.mtime - a.mtime)
  .slice(0, 20);

const notes = files.map((f, i) => {
  const raw = fs.readFileSync(path.join(notesDir, f.name), "utf-8");
  const content = raw.replace(/^---[\s\S]*?---\n*/m, "").trim();
  const title = f.name.replace(/\.md$/, "");
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);

  // Extract tags from frontmatter
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  let tags = [];
  if (fmMatch) {
    const fm = fmMatch[1];
    const tagMatch = fm.match(/tags:\s*\[([^\]]*)\]/);
    if (tagMatch) {
      tags = tagMatch[1].split(",").map(t => t.trim().replace(/['"]/g, "")).filter(Boolean);
    }
  }
  // Also extract #tags from content
  const hashTags = [...content.matchAll(/#([a-z][a-z0-9_-]*)/gi)].map(m => m[1].toLowerCase());
  tags = [...new Set([...tags, ...hashTags])].slice(0, 5);

  // Build wikilinks relative to note
  const links = [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => {
    const parts = m[1].split("|");
    return (parts[parts.length - 1] || parts[0]).trim();
  });

  return { id, title, content, tags, links };
});

const ts = `// Auto-generated from DigitalMind notes — ${notes.length} notes
export type SeedNote = { id: string; title: string; content: string; tags: string[]; links: string[] };

export const digitalMindNotes: SeedNote[] = ${JSON.stringify(notes, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, "..", "src", "assets", "digitalMindNotes.ts"), ts, "utf-8");
console.log(`Generated ${notes.length} notes`);
