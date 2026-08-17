# CLAUDE.md

Project instructions live in [`AGENTS.md`](./AGENTS.md). Read that file.

It holds the repo conventions, shared by Claude Code, Cowork and Command Code.
Nothing project-specific belongs here. Two memory files that drift apart are
worse than one.

The single source of truth for what Daybook is, what is built, what is left and
why: [`BUILD-PLAN.md`](./BUILD-PLAN.md).

Chronological log of past sessions: [`docs/SESSIONS.md`](./docs/SESSIONS.md).

## Starting a session

```
/session-handoff start
```

Reads the newest log entry, `AGENTS.md`, the phase status and the git state,
then reports where things stand before touching anything.

The skill lives in `.agents/skills/session-handoff/`, symlinked into
`.claude/skills/` so Claude Code discovers it. Edit the `.agents/` copy.
