// Regex for [[note-id|Title]] or [[note-id]] wikilinks
const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

export type WikilinkMatch = {
  fullMatch: string;
  noteId: string;
  title: string;
};

/** Extract all wikilinks from a text or HTML string. */
export function extractWikilinks(text: string): WikilinkMatch[] {
  const matches: WikilinkMatch[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    matches.push({
      fullMatch: m[0],
      noteId: m[1].trim(),
      title: (m[2] ?? m[1]).trim(),
    });
  }
  return matches;
}

/** Convert [[wikilinks]] in HTML to styled clickable pills. */
export function renderWikilinksInHtml(html: string): string {
  return html.replace(
    WIKILINK_RE,
    (_full, noteId: string, title?: string) => {
      const label = title ? title.trim() : noteId.trim();
      return `<span class="wikilink-pill" data-note-id="${noteId.trim()}">${label}</span>`;
    }
  );
}
