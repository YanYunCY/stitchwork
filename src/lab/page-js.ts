/**
 * Inline script for the operating-table page. Written without backticks or
 * template substitutions so it embeds cleanly. Every dynamic value reaches the
 * DOM through textContent, never innerHTML, so agent output cannot inject script.
 * `gaugeFill` mirrors src/lab/gauge.ts; a test keeps the two equal.
 */
export const PAGE_JS = String.raw`
'use strict';
function gaugeFill(used, limit) {
  if (limit === null) return null;
  if (!(limit > 0)) return 0;
  return Math.min(1, Math.max(0, 1 - used / limit));
}
var $ = function (id) { return document.getElementById(id); };
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function getJson(path) {
  return fetch(path, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  });
}
function postJson(path, body) {
  return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
}
var clock = { skew: 0 };
var last = { state: null, sig: '' };

function fmtTime(ms) { return new Date(ms).toLocaleTimeString(); }
function fmtLeft(ms) {
  var s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}
function gauge(label, used, limit, exhausted) {
  var fill = gaugeFill(used, limit);
  var g = el('div', 'gauge');
  var row = el('div', 'row');
  row.appendChild(el('span', '', label));
  row.appendChild(el('span', '', fill === null ? 'unlimited' : used + ' / ' + limit + ' · ' + Math.round(fill * 100) + '% left'));
  g.appendChild(row);
  var tube = el('div', 'tube');
  tube.setAttribute('role', 'meter');
  tube.setAttribute('aria-label', label + ' remaining');
  tube.setAttribute('aria-valuemin', '0');
  tube.setAttribute('aria-valuemax', '100');
  var f = el('div', 'fill');
  if (fill === null) { f.className += ' none'; tube.setAttribute('aria-valuetext', 'unlimited'); }
  else {
    var pct = Math.round(fill * 100);
    tube.setAttribute('aria-valuenow', String(pct));
    f.style.width = pct + '%';
    if (exhausted || fill < 0.1) f.className += ' red'; else if (fill < 0.3) f.className += ' amber';
    if (exhausted) f.className += ' none';
  }
  tube.appendChild(f);
  g.appendChild(tube);
  return g;
}
function limb(a) {
  var q = a.quota;
  var cooling = q.coolingUntil !== null && q.coolingUntil > Date.now() + clock.skew;
  var cls = 'limb' + (!a.enabled || !a.available ? ' dim' : '') + (q.exhausted ? ' exhausted' : '') + (cooling ? ' cooling' : '');
  var c = el('article', cls);
  c.appendChild(el('h3', '', a.name));
  c.appendChild(el('div', 'id', a.id));
  if (!a.enabled) c.appendChild(el('span', 'badge off', 'disabled in config'));
  else if (!a.available) c.appendChild(el('span', 'badge off', 'not installed'));
  if (cooling) {
    var b = el('span', 'badge heal', 'stitches healing · ');
    var t = el('span', 'cd', fmtLeft(q.coolingUntil - Date.now() - clock.skew));
    t.setAttribute('data-until', String(q.coolingUntil));
    b.appendChild(t);
    c.appendChild(b);
  }
  if (q.exhausted) c.appendChild(el('span', 'badge out', 'exhausted'));
  c.appendChild(gauge('tokens', q.usedTokens, q.tokenLimit, q.exhausted));
  c.appendChild(gauge('requests', q.usedRequests, q.requestLimit, q.exhausted));
  var m = el('div', 'meta');
  var h = el('strong', '', Math.round(q.headroom * 100) + '%');
  m.appendChild(document.createTextNode('headroom '));
  m.appendChild(h);
  m.appendChild(document.createTextNode(' · ' + (q.resetsAt === null ? 'nothing to reset' : 'resets ' + fmtTime(q.resetsAt))));
  c.appendChild(m);
  return c;
}
function renderLimbs(state) {
  var sig = JSON.stringify(state.agents);
  clock.skew = state.now - Date.now();
  if (sig === last.sig) return;
  last.sig = sig;
  var box = $('limbs');
  box.textContent = '';
  state.agents.forEach(function (a) { box.appendChild(limb(a)); });
  box.classList.remove('flick');
  void box.offsetWidth;
  box.classList.add('flick');
}
function tickCountdowns() {
  var nodes = document.querySelectorAll('.cd');
  for (var i = 0; i < nodes.length; i++) {
    var until = Number(nodes[i].getAttribute('data-until'));
    nodes[i].textContent = fmtLeft(until - Date.now() - clock.skew);
  }
}
function renderTray(runs) {
  var body = $('tray-body');
  body.textContent = '';
  if (!runs.length) {
    var tr0 = el('tr'); var td0 = el('td', 'empty', 'No runs yet. The table is quiet.');
    td0.setAttribute('colspan', '6'); tr0.appendChild(td0); body.appendChild(tr0); return;
  }
  runs.forEach(function (r) {
    var tr = el('tr');
    tr.appendChild(el('td', '', fmtTime(r.ts)));
    tr.appendChild(el('td', '', r.agent));
    tr.appendChild(el('td', r.ok ? 'ok' : 'bad', r.ok ? '✓ ok' : '✗ failed'));
    tr.appendChild(el('td', '', (r.estimated ? '~' : '') + r.tokens));
    tr.appendChild(el('td', '', typeof r.durationMs === 'number' ? (r.durationMs / 1000).toFixed(1) + 's' : '—'));
    var mark = r.rateLimited ? '🧵 rate-limited' : (r.fallbacks > 0 ? '🧵 failover x' + r.fallbacks : '');
    tr.appendChild(el('td', '', mark));
    body.appendChild(tr);
  });
}

var failures = 0;
function refresh() {
  return Promise.all([getJson('/api/state'), getJson('/api/runs')]).then(function (res) {
    failures = 0;
    $('conn').className = '';
    last.state = res[0];
    renderLimbs(res[0]);
    renderTray(res[1].runs);
    if (res[0].readOnly && $('launcher')) $('launcher').hidden = true;
  }, function () {
    failures += 1;
    if (failures >= 3) { $('conn').textContent = 'Disconnected: the lab server is not answering. Retrying…'; $('conn').className = 'on'; }
  });
}
function poll() { refresh().then(function () { setTimeout(poll, 2000); }); }

function setupLauncher() {
  if (!$('launcher')) return;
  var skills = [];
  getJson('/api/skills').then(function (j) {
    skills = j.skills;
    var sel = $('skill');
    skills.forEach(function (s) { var o = el('option', '', s.name); o.value = s.name; sel.appendChild(o); });
    describe();
    if (!skills.length) { $('run').disabled = true; $('launch-status').textContent = 'No skills found.'; }
  }, function () { $('launch-status').textContent = 'Could not load skills.'; });
  function describe() {
    var s = skills.filter(function (x) { return x.name === $('skill').value; })[0];
    $('skill-desc').textContent = s ? s.description + (s.agents.length ? ' (prefers ' + s.agents.join(', ') + ')' : '') : '';
  }
  $('skill').addEventListener('change', describe);
  var watcher = null;
  function finish() { clearInterval(watcher); watcher = null; $('run').disabled = false; $('cancel').disabled = true; refresh(); }
  $('cancel').addEventListener('click', function () { postJson('/api/launch/cancel', {}); });
  $('run').addEventListener('click', function () {
    $('run').disabled = true; $('cancel').disabled = false;
    $('output').textContent = '';
    $('launch-status').textContent = 'Running…';
    watcher = setInterval(function () {
      getJson('/api/launch/status').then(function (s) { if (watcher !== null && s.running && s.agent) $('launch-status').textContent = 'Running on ' + s.agent + '…'; }, function () {});
    }, 500);
    postJson('/api/launch', { skill: $('skill').value, input: $('input').value, agent: $('agent').value }).then(function (r) {
      var b = r.body;
      if (r.status !== 200) { $('launch-status').textContent = 'Error ' + r.status + ': ' + (b.error || 'unknown'); }
      else if (b.refused) { $('launch-status').textContent = 'Refused: ' + b.reason; }
      else {
        var fb = b.fallbacks && b.fallbacks.length ? ' · fell back from ' + b.fallbacks.map(function (f) { return f.agent; }).join(', ') : '';
        $('launch-status').textContent = (b.cancelled ? 'Cancelled' : (b.ok ? 'Finished' : 'Failed')) + ' on ' + b.agent + ' · ' + (b.estimated ? '~' : '') + b.tokens + ' tokens · ' + (b.durationMs / 1000).toFixed(1) + 's' + fb;
        $('output').textContent = b.output || '';
      }
      finish();
    }, function () { $('launch-status').textContent = 'Lost contact with the lab.'; finish(); });
  });
}
setupLauncher();
poll();
setInterval(tickCountdowns, 1000);
`;
