# Prompts

Prompts are data. Each file has YAML frontmatter (`task`, `version`, `model` hint, `inputs`, `output`) and a body with `{{placeholders}}` rendered by `apps/brain/src/prompts.ts`.
`{{profile}}` is always the user's `profile/main` as JSON. Output is enforced with `--json-schema` from `@atlas/schemas` and validated with Zod.
Bump `version` on any behavioural change; the version is stored on every item/audit row.
