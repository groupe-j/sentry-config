# AGENTS.md

Team: Groupe J
Repo: groupe-j/sentry-config

Read the linked Linear issue before work.
Comment the plan in Linear.
Keep changes inside the issue scope.
Open a pull request.
Update Linear with summary, files, tests and pull request link.

<!-- sync:agent-workflow -->

## Agent workflow

Project: Packages & infra partagée
Repo: groupe-j/sentry-config
Team: Groupe J (cle: GRO)

### Before work
- Read the linked Linear issue (context, scope, acceptance criteria).
- Check the triage label: **Pret pour agent** (autonomous) or **Revue humaine** (human+agent tandem).
- Read `CLAUDE.md` and `CLAUDE_SHARED.md`.
- Comment the plan in the Linear issue before code changes.

### During work
- Branch: `username/gro-XXX-titre-slug`
- Keep changes inside the requested scope.
- Run `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` before committing.
- Commit with `Fixes GRO-XXX` to auto-close the issue.

### After work
- Update Linear: summary, files modified, tests, remaining risks, PR link.
- Move issue to "En revue" when PR is opened.

### Escalation rule
If blocked >30 min on a "Pret pour agent" issue: relabel to "Revue humaine", comment what was tried, move on.

Detailed reference: groupe-j/dev-conventions/docs/linear-agent-workflow.md

<!-- /sync:agent-workflow -->
