import { AGENT_IDS } from '../types.ts';
import { PAGE_CSS } from './page-css.ts';
import { PAGE_JS } from './page-js.ts';

const LAUNCHER = `
<section id="launcher" aria-labelledby="h-launch">
  <h2 id="h-launch">Skill launcher</h2>
  <label for="skill">Skill</label>
  <select id="skill"></select>
  <p id="skill-desc" class="note"></p>
  <label for="agent">Agent</label>
  <select id="agent"><option value="auto">auto (route by quota)</option>${AGENT_IDS.map((id) => `<option value="${id}">${id}</option>`).join('')}</select>
  <label for="input">Input</label>
  <textarea id="input" rows="4" placeholder="What should the skill work on?"></textarea>
  <div><button id="run" type="button">⚡ Run</button><button id="cancel" type="button" class="secondary" disabled>Cancel</button></div>
  <p id="launch-status" role="status" aria-live="polite" class="note"></p>
  <pre id="output" aria-label="Skill output"></pre>
</section>`;

/** One self-contained HTML document: inline CSS and JS, no remote assets (Req 15.6). */
export function renderPage(readOnly: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stitchwork lab</title>
<style>${PAGE_CSS}</style>
</head>
<body data-readonly="${readOnly}">
<header>
  <h1>🧟 Stitchwork lab</h1>
  <p class="tag">Four limbs stitched to one table. The tubes show what each agent has left.</p>
  <div id="conn" role="alert"></div>
</header>
<main>
  <section aria-labelledby="h-table"><h2 id="h-table">The operating table</h2><div id="limbs" class="table" aria-live="off"></div></section>
  <section aria-labelledby="h-tray">
    <h2 id="h-tray">Tray · last 20 runs</h2>
    <table>
      <thead><tr><th>When</th><th>Agent</th><th>Result</th><th>Tokens</th><th>Time</th><th>Stitches</th></tr></thead>
      <tbody id="tray-body"></tbody>
    </table>
  </section>${readOnly ? '\n  <p class="note">Read-only mode: the launcher is switched off.</p>' : LAUNCHER}
</main>
<script>${PAGE_JS}</script>
</body>
</html>
`;
}
