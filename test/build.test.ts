import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

describe('installable build (Req 13)', () => {
  it('emits runnable JavaScript with .js import specifiers', () => {
    const out = mkdtempSync(join(tmpdir(), 'stitchwork-build-'));
    try {
      execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(root, 'tsconfig.build.json'), '--outDir', out], { cwd: root });
      const cli = readFileSync(join(out, 'cli.js'), 'utf8');
      assert.ok(cli.includes('"./gateway.js"'));
      assert.ok(!/from ['"]\.\.?\/[^'"]+\.ts['"]/.test(cli));
      const help = execFileSync(process.execPath, [join(out, 'cli.js'), '--help'], { encoding: 'utf8' });
      assert.match(help, /stitchwork demo/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('declares the files and scripts a package needs (Req 13.3)', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    for (const f of ['dist/', 'skills/', 'examples/', 'README.md']) assert.ok(pkg.files.includes(f), f);
    assert.equal(pkg.scripts.prepack, 'npm run build');
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), [], 'zero runtime dependencies');
  });

  it('bin launcher runs from sources or build', () => {
    const help = execFileSync(process.execPath, [join(root, 'bin', 'stitchwork.js'), '--help'], { encoding: 'utf8' });
    assert.match(help, /stitchwork doctor/);
  });
});
