# Brutalist Wrapper Scope

- Wrap existing shadcn primitives with `cn("<repo overrides>", className)` instead of re-implementing them.
- Keep wrappers thin and keep the underlying primitive API recognizable.
- Reuse the repo palette, typography, border treatment, and motion language from `src/app/globals.css`.
- Build mobile-first and prefer container-query-aware layouts.
- If a wrapper needs a new primitive capability, update the primitive deliberately instead of duplicating it here.
