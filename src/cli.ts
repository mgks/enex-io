#!/usr/bin/env node
import process from 'node:process';
import { doSomething } from './index.js';

const args = process.argv.slice(2);

try {
    if (args.length === 0) {
        console.error('Usage: package-name <input>');
        process.exit(1);
    }
    console.log(doSomething(args[0]));
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}