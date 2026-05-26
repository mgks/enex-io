# enex-io

**High-performance parser and generator for Evernote & Apple Notes (.enex) files.**

<p>
  <a href="https://www.npmjs.com/package/enex-io"><img src="https://img.shields.io/npm/v/enex-io.svg?style=flat-square&color=d25353" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/enex-io"><img src="https://img.shields.io/bundlephobia/minzip/enex-io?style=flat-square&color=38bd24" alt="size"></a>
  <a href="https://www.npmjs.com/package/enex-io?activeTab=versions"><img src="https://img.shields.io/npm/dt/enex-io.svg?style=flat-square&color=38bd24" alt="npm downloads"></a>
  <a href="https://github.com/mgks/enex-io/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mgks/enex-io.svg?style=flat-square&color=blue" alt="license"></a>
</p>

A lightweight Node.js library and CLI tool that reads and writes **.enex** files — the format used by both Evernote and Apple Notes. Ideal for migrations, backups, and any pipeline that needs to move notes in or out of the Apple / Evernote ecosystem.

## Features

*   Parse `.enex` archives into structured JSON objects.
*   Generate valid `.enex` files from JSON, including proper `<created>` and `<updated>` timestamps, tags, and HTML content.
*   Handles XSS-safe XML escaping for titles and content.
*   Dates are converted to and from Evernote's compact UTC format (`YYYYMMDDTHHmmssZ`) automatically.

## Installation

```bash
# Install globally for CLI usage
npm install -g enex-io

# Install as a project dependency
npm install enex-io
```

## Usage

### CLI

```bash
# Parse ENEX → JSON
enex-io to-json my-notes.enex
# Output: my-notes.json

# Generate ENEX from JSON
enex-io to-enex backup.json
# Output: backup.enex
```

**Options:**
```
-o, --output <path>   Specify output file path
-p, --pretty          Pretty-print JSON output (default: true)
--version             Show version number
--help                Show help
```

### API

```javascript
import { parseEnex, generateEnex } from 'enex-io';
import fs from 'fs';

// 1. Parse ENEX → Note objects
const xml = fs.readFileSync('notes.enex', 'utf-8');
const notes = parseEnex(xml);

console.log(notes[0].title);   // "My Note"
console.log(notes[0].created); // ISO 8601 string
console.log(notes[0].tags);    // ['work', 'ideas']

// 2. Generate ENEX from Note objects
const myNotes = [
  {
    title: "Hello World",
    content: "<div>This is a <b>test</b>.</div>",
    tags: ["personal", "test"],
    created: "2023-10-27T10:00:00.000Z",
    updated: "2023-10-27T12:00:00.000Z"
  }
];

const enex = generateEnex(myNotes, { application: 'MyApp' });
fs.writeFileSync('export.enex', enex);
```

### Type Definition

```typescript
interface Note {
  title: string;
  content: string;    // HTML content
  tags: string[];
  created: string;    // ISO 8601
  updated: string;    // ISO 8601
  author?: string;
  sourceUrl?: string;
}

interface EnexOptions {
  version?: string;
  application?: string; // Appears in the <en-export> header
}
```

## License

MIT

> **{ github.com/mgks }**
> 
> ![Website Badge](https://img.shields.io/badge/Visit-mgks.dev-blue?style=flat&link=https%3A%2F%2Fmgks.dev) ![Sponsor Badge](https://img.shields.io/badge/%20%20Become%20a%20Sponsor%20%20-red?style=flat&logo=github&link=https%3A%2F%2Fgithub.com%2Fsponsors%2Fmgks)
