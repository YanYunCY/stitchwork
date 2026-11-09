# Lab screenshots

No screenshots are committed yet. They have to be taken in a real browser, and they must not be mocked up.

Take them from the repository root so they show the bundled stand-in agents:

```bash
rm -f .stitchwork/demo-ledger.jsonl
STITCHWORK_FAKE_RATE_LIMIT=gemini node bin/stitchwork.js lab --config examples/demo.config.json --open
```

Then save these as PNG next to this file:

1. `lab-table.png`: the four limbs. Click Run on `explain` first so Gemini shows "stitches healing" and the tray shows a 🧵 failover row.
2. `lab-exhausted.png`: run the `code-review` skill on Claude (agent `claude`) twice; the demo limit is 2 requests, so Claude shows its exhausted red tube.
3. `lab-readonly.png`: `stitchwork lab --read-only`, showing that the launcher is gone.
