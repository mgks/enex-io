// CLI smoke test: writes inputs to test/tmp/, runs the published CLI as a child
// process, reads outputs back, and asserts content. Honours the "create files in
// tmp/, run the test there" workflow required by the workspace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const tmp = join(root, 'tmp');
const cliJs = join(root, '..', 'dist', 'cli.js');

function setup() {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
}

// Run the CLI and return { status, stdout, stderr }.
function runCli(args) {
  return spawnSync('node', [cliJs, ...args], { encoding: 'utf-8' });
}

test('cli: to-enex writes a valid ENEX file into tmp/', () => {
  setup();
  const inputJson = join(tmp, 'notes.json');
  const outputEnx = join(tmp, 'out.enex');
  const notes = [
    { title: 'A', content: 'x', created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z', tags: [] },
    { title: 'B', content: 'y', created: null, updated: null, tags: ['t'] }
  ];
  writeFileSync(inputJson, JSON.stringify(notes, null, 2));

  const r = runCli(['to-enex', inputJson, '-o', outputEnx]);
  assert.equal(r.status, 0, `cli failed: ${r.stderr}`);
  assert.ok(existsSync(outputEnx));

  const xml = readFileSync(outputEnx, 'utf-8');
  assert.match(xml, /<title>A<\/title>/);
  assert.match(xml, /<title>B<\/title>/);
  assert.match(xml, /<tag>t<\/tag>/);
  // Null dates must come through as empty elements, not "now".
  assert.match(xml, /<created><\/created>/);
});

test('cli: to-json parses an ENEX file from tmp/ back to JSON', () => {
  setup();
  const enex = join(tmp, 'source.enex');
  const json = join(tmp, 'source.json');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export3.dtd">
<en-export export-date="20260101T000000Z" application="cli-test" version="1.0">
  <note>
    <title>Parsed Title</title>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note><div>Body</div></en-note>]]></content>
    <created>20260102T101010Z</created>
    <updated>20260103T101010Z</updated>
    <tag>foo</tag>
  </note>
</en-export>`;
  writeFileSync(enex, xml);

  const r = runCli(['to-json', enex, '-o', json]);
  assert.equal(r.status, 0, `cli failed: ${r.stderr}`);
  const out = JSON.parse(readFileSync(json, 'utf-8'));
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Parsed Title');
  assert.equal(out[0].created, '2026-01-02T10:10:10Z');
  assert.deepEqual(out[0].tags, ['foo']);
});

test('cli: missing input file exits non-zero with a clear error', () => {
  setup();
  const r = runCli(['to-enex', join(tmp, 'does-not-exist.json')]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Input file not found/);
});

test('cli: invalid JSON input exits non-zero', () => {
  setup();
  const badJson = join(tmp, 'bad.json');
  writeFileSync(badJson, '{ not json');
  const r = runCli(['to-enex', badJson]);
  assert.notEqual(r.status, 0);
});

test('cleanup', () => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});
