#!/usr/bin/env node
// Launcher: prefer the compiled build (npm install -g), fall back to the
// TypeScript sources, which Node 22.18+ runs natively by stripping types.
import { existsSync } from 'node:fs';

const built = new URL('../dist/cli.js', import.meta.url);
const { run } = existsSync(built) ? await import(built.href) : await import('../src/cli.ts');
run();
