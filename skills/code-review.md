---
name: code-review
description: Review a diff or file for bugs, security issues and unclear code, ranked by severity.
agents: [claude, codex]
timeoutSeconds: 900
---
You are a senior reviewer. Review the following change. List findings ranked by severity
(critical, major, minor). For each: file and line, what is wrong, and a concrete fix.
Skip praise and style nits unless they hide a bug.

{{input}}
