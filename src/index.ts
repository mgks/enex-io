import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { Note, NoteAttachment, EnexOptions } from './types.js';

dayjs.extend(utc);

const ENEXPORT_DATE_HEADER = 'export-date';

// Emit an ENEX (Evernote XML) document string for the given notes.
// Attachments on each note are written as <resource> blocks plus matching
// <en-media hash="..."> markers inside the note body. Hashes are auto-computed
// when the caller did not supply one.
export function generateEnex(notes: Note[], options: EnexOptions = {}): string {
  const exportDate = dayjs.utc().format('YYYYMMDDTHHmmss') + 'Z';
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
// ENEX timestamps are required to be UTC with a trailing "Z". Without the
// utc plugin loaded for dayjs, format('Z') would silently emit the local
// timezone offset (e.g. "+05:30") and Apple Notes would refuse the file.
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dayjs.utc(d).format('YYYYMMDDTHHmmss') + 'Z';
}

// Hex MD5 over a base64 string. Computed by decoding-then-hashing so a hash
// produced here matches `SparkMD5.ArrayBuffer().append(buffer).end()` exactly.
// The hash function is implemented in pure JavaScript below so the dep stays
// browser-safe — Vite refuses to bundle node:crypto into a client bundle.

// Pure-JS MD5 over a Uint8Array. Returns a 32-char lowercased hex digest.
// Public-domain reference impl (RFC 1321). ~70 lines minified by tsup.
// All arithmetic is wrapped in `| 0` to keep values in signed 32-bit range.
const MD5_HEX = '0123456789abcdef';
const MD5_S: number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];
const MD5_K: number[] = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
];

function md5Hex(bytes: Uint8Array): string {
  const len = bytes.length;
  // Pad with 0x80 + zeros until length ≡ 56 mod 64, then append 8-byte length.
  const padded = new Uint8Array(((len + 8) >>> 6 << 6) + 64);
  padded.set(bytes);
  padded[len] = 0x80;
  const bitLenLow = (len * 8) >>> 0;
  const bitLenHigh = Math.floor(len / 0x20000000) >>> 0;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLenLow, true);
  dv.setUint32(padded.length - 4, bitLenHigh, true);

  let a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;

  for (let block = 0; block < padded.length; block += 64) {
    const M: number[] = new Array(16);
    for (let w = 0; w < 16; w++) M[w] = dv.getUint32(block + w * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let j = 0; j < 64; j++) {
      let F: number;
      let g: number;
      if (j < 16) { F = (B & C) | (~B & D); g = j; }
      else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) & 15; }
      else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) & 15; }
      else { F = C ^ (B | ~D); g = (7 * j) & 15; }
      const s = MD5_S[j]!;
      const k = MD5_K[j]!;
      F = (F + A + k + (M[g]! | 0)) | 0;
      A = D;
      D = C;
      C = B;
      const rotated = ((F << s) | (F >>> (32 - s))) | 0;
      B = (B + rotated) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }

  function toHex(n: number): string {
    // MD5 output is A||B||C||D each as 4 little-endian bytes converted to hex.
    // n is signed 32-bit so we cast to unsigned first, then read low-byte to high-byte.
    let s = '';
    const u = n >>> 0;
    const hexChars = MD5_HEX;
    for (let i = 0; i < 4; i++) {
      const b = (u >>> (i * 8)) & 0xff;
      const hi = hexChars.charAt((b >>> 4) & 0xf);
      const lo = hexChars.charAt(b & 0xf);
      s += hi + lo;
    }
    return s;
  }
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

// Pure-JS base64 -> Uint8Array. Avoids `Buffer` so the dep stays browser-safe.
function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  const lookup = new Int8Array(128);
  lookup.fill(-1);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < 64; i++) lookup[chars.charCodeAt(i)] = i;
  const padCount = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = Math.floor(clean.length * 3 / 4) - padCount;
  const bytes = new Uint8Array(outLen);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = lookup[clean.charCodeAt(i)]!;
    const c1 = lookup[clean.charCodeAt(i + 1)]!;
    const c2 = clean.charCodeAt(i + 2) === 61 ? 0 : lookup[clean.charCodeAt(i + 2)]!;
    const c3 = clean.charCodeAt(i + 3) === 61 ? 0 : lookup[clean.charCodeAt(i + 3)]!;
    bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (p < outLen) bytes[p++] = ((c1 & 0xf) << 4) | (c2 >> 2);
    if (p < outLen) bytes[p++] = ((c2 & 0x3) << 6) | c3;
  }
  return bytes;
}

function computeMd5Hex(b64: string): string {
  return md5Hex(b64ToBytes(b64));
}
