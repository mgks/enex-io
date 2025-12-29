#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import { createRequire } from 'node:module';
import { parseEnex, generateEnex } from './index.js';
import { Note } from './types.js';

// 1. Clean Metadata Loading
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('enex-io')
  .description(pkg.description)
  .version(pkg.version, '-v, --version')
  .helpOption('-h, --help', 'Display help for command')
  .showHelpAfterError();

// --- Command: ENEX -> JSON ---
program
  .command('to-json')
  .description('Convert an .enex file into a structured .json file')
  .argument('<input>', 'Input .enex file path')
  .option('-o, --output <path>', 'Output .json file path')
  .option('-p, --pretty', 'Pretty print JSON output', true)
  .action((input, options) => {
    try {
      if (!fs.existsSync(input)) throw new Error(`Input file not found: ${input}`);
      
      console.log(`⏳ Parsing ${input}...`);
      const xml = fs.readFileSync(input, 'utf-8');
      const notes = parseEnex(xml);
      
      const outPath = options.output || input.replace(/\.enex$/i, '.json');
      const jsonContent = options.pretty ? JSON.stringify(notes, null, 2) : JSON.stringify(notes);

      fs.writeFileSync(outPath, jsonContent);
      console.log(`✅ Success! Converted ${notes.length} notes to ${outPath}`);
    } catch (e: any) {
      console.error(`❌ Error: ${e.message}`);
      process.exit(1);
    }
  });

// --- Command: JSON -> ENEX ---
program
  .command('to-enex')
  .description('Convert a .json file into an importable .enex file')
  .argument('<input>', 'Input .json file path')
  .option('-o, --output <path>', 'Output .enex file path')
  .option('-t, --title <name>', 'Application name', 'enex-io')
  .action((input, options) => {
    try {
      if (!fs.existsSync(input)) throw new Error(`Input file not found: ${input}`);

      console.log(`⏳ Generating ENEX from ${input}...`);
      const json = fs.readFileSync(input, 'utf-8');
      const notes: Note[] = JSON.parse(json);
      
      if (!Array.isArray(notes)) throw new Error("JSON must be an array of note objects");
      
      const xml = generateEnex(notes, { application: options.title });
      const outPath = options.output || input.replace(/\.json$/i, '.enex');
      
      fs.writeFileSync(outPath, xml);
      console.log(`✅ Success! Generated .enex file at ${outPath}`);
    } catch (e: any) {
      console.error(`❌ Error: ${e.message}`);
      process.exit(1);
    }
  });

program.parse();