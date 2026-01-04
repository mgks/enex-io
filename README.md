# enex-io

**High-performance parser and generator for Evernote & Apple Notes (.enex) files.**

<p>
  <img src="https://img.shields.io/npm/v/enex-io.svg?style=flat-square&color=d25353" alt="npm version">
  <img src="https://img.shields.io/bundlephobia/minzip/enex-io?style=flat-square&color=38bd24" alt="size">
  <img src="https://img.shields.io/npm/dt/enex-io.svg?style=flat-square&color=success&color=38bd24" alt="npm downloads">
  <img src="https://img.shields.io/github/license/mgks/enex-io.svg?style=flat-square&color=blue" alt="license">
</p>

A lightweight, zero-dependency Node.js library and CLI tool to convert **.enex** files to JSON and back. Perfect for migrations, backups, and data processing.

## Installation

```bash
# Install globally for CLI usage
npm install -g enex-io

# Install as a dependency in your project
npm install enex-io
```

## CLI Usage

**Convert ENEX to JSON**
```bash
enex-io to-json my-notes.enex
# Output: my-notes.json
```

**Convert JSON to ENEX**
```bash
enex-io to-enex backup.json
# Output: backup.enex
```

**Options**
```bash
-o, --output <path>   Specify output file path
-p, --pretty          Pretty print JSON output (default: true)
--version             Show version number
--help                Show help
```

## API Usage

Built for modern Node.js environments (ESM).

```javascript
import { parseEnex, generateEnex } from 'enex-io';
import fs from 'fs';

// 1. Parse ENEX to Object
const xml = fs.readFileSync('notes.enex', 'utf-8');
const notes = parseEnex(xml);

console.log(notes[0].title); // "My Note"

// 2. Generate ENEX from Object
const myNotes = [
  {
    title: "Hello World",
    content: "<div>This is a <b>test</b>.</div>",
    tags: ["personal", "test"],
    created: "2023-10-27T10:00:00.000Z",
    updated: "2023-10-27T12:00:00.000Z"
  }
];

const enexOutput = generateEnex(myNotes);
fs.writeFileSync('export.enex', enexOutput);
```

## Type Definition

The standard Note object used by the parser and generator:

```typescript
interface Note {
  title: string;
  content: string; // HTML content string
  tags: string[];
  created: string; // ISO 8601 Date String
  updated: string; // ISO 8601 Date String
  author?: string;
  sourceUrl?: string;
}
```

## License

MIT

> **{ github.com/mgks }**
> 
> ![Website Badge](https://img.shields.io/badge/Visit-mgks.dev-blue?style=flat&link=https%3A%2F%2Fmgks.dev) ![Sponsor Badge](https://img.shields.io/badge/%20%20Become%20a%20Sponsor%20%20-red?style=flat&logo=github&link=https%3A%2F%2Fgithub.com%2Fsponsors%2Fmgks)
