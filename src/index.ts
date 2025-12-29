import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import { Note, EnexOptions } from './types.js'; // Fix: Added .js

export function generateEnex(notes: Note[], options: EnexOptions = {}): string {
  const dateStr = dayjs().format('YYYYMMDDTHHmmssZ');
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export3.dtd">
<en-export export-date="${dateStr}" application="${options.application || 'enex-io'}" version="1.0">`;

  for (const note of notes) {
    xml += `
  <note>
    <title>${escapeXml(note.title)}</title>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>${formatContent(note.content)}</en-note>]]></content>
    <created>${formatDate(note.created)}</created>
    <updated>${formatDate(note.updated)}</updated>
    ${note.tags.map(tag => `<tag>${escapeXml(tag)}</tag>`).join('')}
  </note>`;
  }

  xml += `\n</en-export>`;
  return xml;
}

export function parseEnex(xmlContent: string): Note[] {
  const $ = cheerio.load(xmlContent, { xmlMode: true });
  const notes: Note[] = [];

  $('note').each((_, el) => {
    const node = $(el);
    const title = node.find('title').text() || 'Untitled';
    const contentRaw = node.find('content').text();
    
    // Extract inner HTML from the CDATA/en-note wrapper
    const contentMatch = /<en-note[^>]*>([\s\S]*)<\/en-note>/.exec(contentRaw);
    
    // Fix: Strict Check. If match exists, use index 1, else empty string.
    // This solves "Type undefined is not assignable to string"
    const content = (contentMatch && contentMatch[1]) ? contentMatch[1] : '';

    const created = parseEnexDate(node.find('created').text());
    const updated = parseEnexDate(node.find('updated').text());
    
    const tags: string[] = [];
    
    // Fix: Wrapped in block {} to avoid returning 'number' (array length)
    // This solves "Type number is not assignable to void"
    node.find('tag').each((_, tag) => {
      tags.push($(tag).text());
    });

    notes.push({ title, content, created, updated, tags });
  });

  return notes;
}

// --- Helpers ---

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
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

function formatContent(html: string): string {
  if (!html) return '';
  return html.replace(/<br>/g, '<br/>');
}

function formatDate(isoString: string): string {
  return dayjs(isoString).isValid() 
    ? dayjs(isoString).format('YYYYMMDDTHHmmssZ') 
    : dayjs().format('YYYYMMDDTHHmmssZ');
}

function parseEnexDate(enexDate: string): string {
  if (!enexDate) return new Date().toISOString();
  const iso = enexDate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z');
  return dayjs(iso).isValid() ? iso : new Date().toISOString();
}