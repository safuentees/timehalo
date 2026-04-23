@AGENTS.md

# Claude-Specific Loading

- Keep this file thin. Repo-wide defaults live in `AGENTS.md`.
- Persistent Claude guidance lives in `.claude/rules/`.
- On-demand workflows live in `.claude/skills/`, which mirrors `.agents/skills/`.
- Use skills for long checklists, examples, and debugging playbooks instead of growing this file again.
