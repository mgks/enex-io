import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/cli.ts'], // Auto-detect CLI and API entry points
	format: ['esm'],       // Modern ESM only
	dts: true,             // Generate .d.ts files
	clean: true,           // Clean dist folder
	splitting: false,	   // No code splitting for Node.js
	minify: true,          // Small file size
	sourcemap: true,	   // Include source maps
});