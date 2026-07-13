// Pure-API tests for generateEnex covering the gaps closed in 0.3.0:
//   - <en-media hash="..."> markers are emitted next to <resource> blocks
//   - md5 hash of attachment data is auto-computed when caller omits it
//   - HTML normalisation: <input type="checkbox" checked> -> <en-todo checked="true"/>
//   - null dates are emitted as empty <created>/<updated> (no silent "now")
//   - <note-attributes> author/source-url emitted when present
//   - round-trip: generate -> parse should preserve attachments and attrs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateEnex, parseEnex } from '../dist/index.js';

const samplePngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('generateEnex: emits DOCTYPE + <en-export> header with current app', () => {
  const xml = generateEnex([{ title: 'T', content: 'x', created: null, updated: null, tags: [] }], {
    application: 'TestApp'
  });
  assert.match(xml, /<!DOCTYPE en-export SYSTEM "http:\/\/xml\.evernote\.com\/pub\/evernote-export3\.dtd">/);
  assert.match(xml, /application="TestApp"/);
});

test('generateEnex: writes <en-media> marker next to <resource> for each attachment', () => {
  const xml = generateEnex(
    [{
      title: 'T',
      content: '<div>body</div>',
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-02T00:00:00Z',
      tags: [],
      attachments: [{
        data: samplePngBase64,
        mime: 'image/png',
        fileName: 'pic.png',
        hash: '91e42db1c66c0b276abf6234dc50b2eb'
      }]
    }]
  );
  assert.match(xml, /<en-media type="image\/png" hash="91e42db1c66c0b276abf6234dc50b2eb"\/>/);
  assert.match(xml, /<data encoding="base64">iVBORw0KG/);
  assert.match(xml, /<mime>image\/png<\/mime>/);
  assert.match(xml, /<file-name>pic\.png<\/file-name>/);
});

test('generateEnex: auto-computes md5 hash when caller omits one', () => {
  const xml = generateEnex(
    [{
      title: 'T',
      content: '',
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
      tags: [],
      attachments: [{ data: samplePngBase64, mime: 'image/png' }]
    }]
  );
  // MD5 of the decoded bytes, not the base64 text.
  assert.match(xml, /hash="91e42db1c66c0b276abf6234dc50b2eb"/);
});

test('generateEnex: normalises <input type="checkbox" checked> into <en-todo>', () => {
  const xml = generateEnex(
    [{
      title: 'T',
      content: '<input type="checkbox" checked/> done',
      created: null,
      updated: null,
      tags: []
    }]
  );
  assert.match(xml, /<en-todo checked="true"\/>/);
  assert.doesNotMatch(xml, /<input/);
});

test('generateEnex: unchecked checkbox becomes <en-todo/>', () => {
  const xml = generateEnex(
    [{
      title: 'T',
      content: '<input type="checkbox"/> open',
      created: null,
      updated: null,
      tags: []
    }]
  );
  assert.match(xml, /<en-todo\/>/);
});

test('generateEnex: null dates are emitted as empty elements (no "now" lie)', () => {
  const xml = generateEnex(
    [{ title: 'T', content: 'x', created: null, updated: null, tags: [] }]
  );
  assert.match(xml, /<created><\/created>/);
  assert.match(xml, /<updated><\/updated>/);
  // Must not contain a freshly-baked "today" date by accident.
  assert.doesNotMatch(xml, /<created>\d{8}T\d{6}Z<\/created>/);
});

test('generateEnex: emits <note-attributes> when author/sourceUrl set', () => {
  const xml = generateEnex(
    [{
      title: 'T',
      content: 'x',
      created: null,
      updated: null,
      tags: [],
      author: 'Ghazi',
      sourceUrl: 'https://example.com/note/1'
    }]
  );
  assert.match(xml, /<note-attributes>/);
  assert.match(xml, /<author>Ghazi<\/author>/);
  assert.match(xml, /<source-url>https:\/\/example\.com\/note\/1<\/source-url>/);
});

test('roundtrip: attachments + author + null-date survive generate -> parse', () => {
  const xml = generateEnex(
    [{
      title: 'Shop',
      content: '<ul><li>Milk</li></ul>',
      created: '2026-01-15T10:30:00Z',
      updated: null,
      tags: ['errands'],
      author: 'Ghazi',
      attachments: [{
        data: samplePngBase64,
        mime: 'image/png',
        fileName: 'note.png',
        hash: '91e42db1c66c0b276abf6234dc50b2eb'
      }]
    }]
  );
  const [parsed] = parseEnex(xml);
  assert.equal(parsed.title, 'Shop');
  assert.equal(parsed.author, 'Ghazi');
  assert.equal(parsed.updated, null);
  assert.deepEqual(parsed.tags, ['errands']);
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0].hash, '91e42db1c66c0b276abf6234dc50b2eb');
  assert.equal(parsed.attachments[0].fileName, 'note.png');
});
