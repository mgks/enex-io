import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import { createHash } from 'node:crypto';
import { Note, NoteAttachment, EnexOptions } from './types.js';

const ENEXPORT_DATE_HEADER = 'export-date';

// Emit an ENEX (Evernote XML) document string for the given notes.
// Attachments on each note are written as <resource> blocks plus matching
// <en-media hash="..."> markers inside the note body. Hashes are auto-computed
// when the caller did not supply one.
export function generateEnex(notes: Note[], options: EnexOptions = {}): string {
  const exportDate = dayjs().format('YYYYMMDDTHHmmssZ');
  const app = escapeXmlAttr(options.application || 'enex-io');
  const version = options.version || '1.0';
  const normalize = options.normalize !== false;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export3.dtd">\n';
  xml += `<en-export ${ENEXPORT_DATE_HEADER}="${exportDate}" application="${app}" version="${version}">`;

  for (const note of notes) {
    xml += '\n  <note>';
    xml += `\n    <title>${escapeXmlText(note.title)}</title>`;

    // Build resources and the body content in one pass so we can drop <en-media>
    // markers into the body alongside each <resource>. Attachments are emitted as
    // <resource> at the end of the note, regardless of in-body position.
    const resources: string[] = [];
    let body = note.content || '';
    if (note.attachments && note.attachments.length > 0) {
      body += '\n<div>';
      for (const att of note.attachments) {
        const hash = (att.hash || computeMd5Hex(att.data)).toLowerCase();
        const fileName = att.fileName ? escapeXmlText(att.fileName) : '';
        body += `<en-media type="${escapeXmlAttr(att.mime)}" hash="${hash}"/>`;
        resources.push(
          `\n    <resource>` +
          `\n      <data encoding="base64">${att.data}</data>` +
          `\n      <mime>${escapeXmlText(att.mime)}</mime>` +
          (fileName ? `\n      <resource-attributes><file-name>${fileName}</file-name></resource-attributes>` : '') +
          `\n    </resource>`
        );
      }
      body += '</div>';
    }

    const normalised = normalize ? normalizeEnml(body) : body;
    xml += `\n    <content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?>`;
    xml += `<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">`;
    xml += `<en-note>${normalised}</en-note>]]></content>`;
    xml += `\n    <created>${formatDate(note.created)}</created>`;
    xml += `\n    <updated>${formatDate(note.updated)}</updated>`;

    if (note.author || note.sourceUrl) {
      xml += '\n    <note-attributes>';
      if (note.author) xml += `\n      <author>${escapeXmlText(note.author)}</author>`;
      if (note.sourceUrl) xml += `\n      <source-url>${escapeXmlText(note.sourceUrl)}</source-url>`;
      xml += '\n    </note-attributes>';
    }

    for (const tag of note.tags || []) {
      xml += `\n    <tag>${escapeXmlText(tag)}</tag>`;
    }

    if (resources.length > 0) {
      xml += resources.join('');
    }
    xml += '\n  </note>';
  }

  xml += '\n</en-export>';
  return xml;
}

// Parse an ENEX document into Note objects. Returns attachments as NoteAttachment[]
// and preserves <note-attributes> author/sourceUrl. Invalid dates come through as null
// so the caller can decide between "today" and "missing" instead of getting a quiet lie.
export function parseEnex(xmlContent: string): Note[] {
  const $ = cheerio.load(xmlContent, { xmlMode: true });
  const notes: Note[] = [];

  $('note').each((_, el) => {
    const node = $(el);

    const title = node.find('title').text() || 'Untitled';

    // Extract the <en-note> body. cheerio xmlMode does not always preserve CDATA
    // bounds cleanly, so we fall back to a regex on the raw text when cheerio empty.
    const rawContent = node.find('content').text();
    let content = '';
    const m = /<en-note[^>]*>([\s\S]*)<\/en-note>/i.exec(rawContent);
    if (m && m[1]) content = m[1];
    else content = stripEnNote(rawContent);

    const created = parseEnxDate(node.find('created').text());
    const updated = parseEnxDate(node.find('updated').text());

    const author = node.find('note-attributes > author').text() || undefined;
    const sourceUrl = node.find('note-attributes > source-url').text() || undefined;

    const tags: string[] = [];
    node.find('tag').each((_, tag) => {
      const t = $(tag).text().trim();
      if (t) tags.push(t);
    });

    const attachments: NoteAttachment[] = [];
    node.find('resource').each((_, res) => {
      const r = $(res);
      const data = (r.find('data').text() || '').replace(/\s+/g, '');
      const mime = r.find('mime').text() || 'application/octet-stream';
      const fileName = r.find('resource-attributes > file-name').text() || undefined;
      if (!data) return;          // skip empty resources — nothing to embed
      attachments.push({
        data,
        mime,
        fileName,
        hash: computeMd5Hex(data)
      });
    });

    const note: Note = { title, content, tags, created, updated };
    if (author) note.author = author;
    if (sourceUrl) note.sourceUrl = sourceUrl;
    if (attachments.length > 0) note.attachments = attachments;
    notes.push(note);
  });

  return notes;
}

// --- helpers ---

// Escape XML text. Conservative: the five predefined entities only. Used in
// <title>, <tag>, <author>, <file-name> — element bodies, not attributes.
function escapeXmlText(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&]/g, c => c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;');
}

// Escape the full set of predefined entities. Used inside attribute values like
// application="...", type="...", where both ' and " matter.
function escapeXmlAttr(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Normalize HTML produced by tools (Google Keep, Notion export) into ENML:
//   <input type="checkbox" checked> -> <en-todo checked="true"/>
//   <input type="checkbox">          -> <en-todo/>
//   <br>                             -> <br/>
//   <img ...>                        -> <en-media> if alt/data attributes hint, else drop.
// HTML boolean attributes carry truth by presence, not by value.
function normalizeEnml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<input\b[^>]*>/gi, tag => {
      if (!/\btype\s*=\s*["']?checkbox["']?/i.test(tag)) return tag;
      return /\bchecked\b/i.test(tag) ? '<en-todo checked="true"/>' : '<en-todo/>';
    })
    .replace(/<br>/g, '<br/>');
}

// Last-resort stripper when the <en-note>...</en-note> regex misses. Tries to keep
// only the text between the wrapper tags.
function stripEnNote(raw: string): string {
  const start = raw.indexOf('<en-note');
  const end = raw.lastIndexOf('</en-note>');
  if (start === -1 || end === -1) return raw;
  const openerEnd = raw.indexOf('>', start);
  if (openerEnd === -1 || openerEnd >= end) return '';
  return raw.slice(openerEnd + 1, end);
}

// Evernote stores dates as YYYYMMDDTHHmmssZ. Convert to ISO when we recognise
// the shape; null when we do not. Null is the honest answer; substituting "now"
// is the old behaviour this release deletes.
function parseEnxDate(s: string): string | null {
  if (!s) return null;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s.trim());
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : iso;
}

// Render an ISO date (or null) in ENEX compact form. Null stays null.
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dayjs(d).format('YYYYMMDDTHHmmssZ');
}

// Hex MD5 over a base64 string. Computed by decoding-then-hashing so a hash
// produced here matches `SparkMD5.ArrayBuffer().append(buffer).end()` exactly.
function computeMd5Hex(b64: string): string {
  const bytes = Buffer.from(b64, 'base64');
  return createHash('md5').update(bytes).digest('hex');
}
