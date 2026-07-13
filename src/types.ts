// Public note shape produced by parseEnex and consumed by generateEnex.
// Attachments model the ENEX <resource>/<en-media> pair so notes can be round-tripped
// through Evernote / Apple Notes without losing images.
export interface Note {
  title: string;
  content: string;             // HTML for the <en-note> body
  tags: string[];
  created: string | null;      // ISO 8601; null when not parseable (no silent substitution)
  updated: string | null;
  author?: string;
  sourceUrl?: string;
  attachments?: NoteAttachment[];
}

// ENEX <resource> payload. `hash` is the hex MD5 referenced by <en-media hash="..."/>
// in the body. When omitted during generation, the generator computes it for you.
// `data` is the base64 binary payload as Evernote stores it in <data encoding="base64">.
export interface NoteAttachment {
  data: string;
  mime: string;
  fileName?: string;
  hash?: string;       // hex MD5; computed on write when missing
}

export interface EnexOptions {
  version?: string;
  application?: string;
  // When true (default), HTML in <en-note> gets normalized for ENML:
  // <input type="checkbox" checked> -> <en-todo checked="true"/>, <br> -> <br/>.
  // Set false to emit raw HTML unchanged.
  normalize?: boolean;
}