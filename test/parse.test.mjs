// Pure-API tests for parseEnex against a committed ENEX fixture. Validates that:
//   - <note-attributes> author and source-url come through
//   - <resource> blocks become NoteAttachment[] entries with correct mime/data/hash
//   - invalid <created>/<updated> values come through as null (no silent substitution)
//   - <en-media hash="..."> markers do not require source-side data to parse
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEnex } from '../dist/index.js';

const root = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(root, 'fixtures', 'multi.enex'), 'utf-8');

test('parseEnex: titles come through in order', () => {
  const notes = parseEnex(fixture);
  assert.equal(notes.length, 3);
  assert.equal(notes[0].title, 'Shopping list');
  assert.equal(notes[1].title, 'Plan: ship 0.3');
  assert.equal(notes[2].title, 'Legacy note with bad date');
});

test('parseEnex: tags collected', () => {
  const [first] = parseEnex(fixture);
  assert.deepEqual(first.tags.sort(), ['errands', 'home']);
});

test('parseEnex: created + updated parsed as ISO', () => {
  const [first] = parseEnex(fixture);
  assert.equal(first.created, '2026-01-15T10:30:00Z');
  assert.equal(first.updated, '2026-01-15T11:00:00Z');
});

test('parseEnex: invalid date becomes null (no silent substitution)', () => {
  const [, , legacy] = parseEnex(fixture);
  assert.equal(legacy.created, null);
  assert.equal(legacy.updated, null);
});

test('parseEnex: note-attributes preserved', () => {
  const [first] = parseEnex(fixture);
  assert.equal(first.author, 'Ghazi');
  assert.equal(first.sourceUrl, 'https://keep.google.com/#NOTE/abc');
});

test('parseEnex: <resource> becomes NoteAttachment[] with hash and base64 data', () => {
  const [first] = parseEnex(fixture);
  assert.ok(Array.isArray(first.attachments));
  assert.equal(first.attachments.length, 1);
  const att = first.attachments[0];
  assert.equal(att.mime, 'image/png');
  assert.equal(att.fileName, 'note.png');
  assert.equal(typeof att.data, 'string');
  assert.ok(att.data.length > 0);
  // Hash must be a 32-char hex string lowercased.
  assert.match(att.hash, /^[0-9a-f]{32}$/);
  // Hash must match md5 of the decoded bytes (md5 of the 1x1 PNG bytes in the fixture).
  const expected = '91e42db1c66c0b276abf6234dc50b2eb';
  assert.equal(att.hash, expected);
});

test('parseEnex: <en-note> body extracted (no CDATA wrapper leakage)', () => {
  const [first] = parseEnex(fixture);
  // CDA envelope and DTD should not bleed into content.
  assert.doesNotMatch(first.content, /<!\[CDATA\[/);
  assert.doesNotMatch(first.content, /<!DOCTYPE/);
  assert.doesNotMatch(first.content, /<en-note/);
  assert.match(first.content, /<ul><li>Milk<\/li><li>Bread<\/li><\/ul>/);
});

test('parseEnex: notes without <resource> have no attachments field', () => {
  const [, plan] = parseEnex(fixture);
  assert.ok(!('attachments' in plan));
});
