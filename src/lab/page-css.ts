/** Inline stylesheet for the operating-table page. No remote fonts, images or imports (Req 15.6). */
export const PAGE_CSS = `
:root { color-scheme: dark; --slab:#15181a; --slab2:#1d2225; --ink:#e4ecdf; --dim:#8c9a8f; --stitch:#4c5a50;
  --green:#6dff8a; --amber:#ffb84d; --red:#ff5d5d; --glass:#0b0d0e; --accent:#b7ff6a; }
* { box-sizing: border-box; }
body { margin:0; padding:24px clamp(12px,4vw,48px) 64px; background:radial-gradient(ellipse at top,#222a26,#0d0f10 70%) fixed;
  color:var(--ink); font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
h1 { margin:0; font-size:1.7rem; letter-spacing:.04em; } h2 { margin:32px 0 12px; font-size:1.05rem; color:var(--accent); text-transform:uppercase; letter-spacing:.12em; }
.tag { margin:4px 0 0; color:var(--dim); }
#conn { display:none; margin-top:12px; padding:6px 12px; border:2px dashed var(--red); color:var(--red); border-radius:6px; }
#conn.on { display:inline-block; }
.table { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:20px; padding:20px; background:var(--slab);
  border:2px dashed var(--stitch); border-radius:14px; box-shadow:inset 0 0 40px #000; }
.limb { position:relative; padding:16px 16px 14px; background:var(--slab2); border:2px dashed var(--stitch); border-radius:10px; }
.limb::before, .limb::after { content:""; position:absolute; top:6px; width:9px; height:9px; border-radius:50%; background:#5b6a60; box-shadow:inset -1px -1px 2px #000; }
.limb::before { left:6px; } .limb::after { right:6px; }
.limb h3 { margin:0 0 2px; font-size:1.1rem; } .limb .id { color:var(--dim); font-size:.8rem; }
.limb.dim { opacity:.5; filter:grayscale(.7); }
.limb.exhausted { border-color:var(--red); } .limb.cooling { border-color:var(--amber); }
.badge { display:inline-block; margin:6px 6px 0 0; padding:1px 8px; border-radius:99px; font-size:.78rem; border:1px solid currentColor; }
.badge.heal { color:var(--amber); } .badge.out { color:var(--red); } .badge.off { color:var(--dim); }
.gauge { margin-top:12px; } .gauge .row { display:flex; justify-content:space-between; font-size:.82rem; color:var(--dim); }
.tube { height:14px; margin-top:3px; background:var(--glass); border:1px solid #39443d; border-radius:8px; overflow:hidden; box-shadow:inset 0 2px 4px #000; }
.fill { height:100%; width:0; border-radius:8px; background:linear-gradient(#a8ffbb,var(--green)); box-shadow:0 0 10px var(--green); transition:width .6s ease; }
.fill.amber { background:linear-gradient(#ffd89a,var(--amber)); box-shadow:0 0 10px var(--amber); }
.fill.red { background:linear-gradient(#ff9a9a,var(--red)); box-shadow:0 0 10px var(--red); }
.fill.none { width:0 !important; box-shadow:none; }
.meta { margin-top:10px; font-size:.82rem; color:var(--dim); } .meta strong { color:var(--ink); }
table { width:100%; border-collapse:collapse; background:var(--slab); border:2px dashed var(--stitch); }
th, td { padding:6px 10px; text-align:left; border-bottom:1px solid #2a312d; } th { color:var(--dim); font-weight:normal; }
td.ok { color:var(--green); } td.bad { color:var(--red); } .empty { color:var(--dim); padding:12px; }
#launcher { padding:16px; background:var(--slab); border:2px dashed var(--stitch); border-radius:10px; }
label { display:block; margin-top:10px; color:var(--dim); font-size:.85rem; }
select, textarea { width:100%; max-width:640px; padding:8px; color:var(--ink); background:var(--glass); border:1px solid var(--stitch); border-radius:6px; font:inherit; }
button { margin:12px 8px 0 0; padding:8px 18px; font:inherit; color:#0b0d0e; background:var(--accent); border:0; border-radius:6px; cursor:pointer; }
button.secondary { color:var(--ink); background:#2c3530; } button:disabled { opacity:.45; cursor:not-allowed; }
:focus-visible { outline:3px solid #fff; outline-offset:2px; }
#output { white-space:pre-wrap; word-break:break-word; margin:12px 0 0; padding:12px; min-height:3em; background:var(--glass); border:1px solid #2a312d; border-radius:6px; }
.note { color:var(--dim); }
@keyframes flicker { 0%,100% { opacity:1 } 40% { opacity:.55 } 60% { opacity:.9 } }
.flick { animation:flicker .5s ease 1; }
@media (prefers-reduced-motion: reduce) { .fill { transition:none; } .flick { animation:none; } }
`;
