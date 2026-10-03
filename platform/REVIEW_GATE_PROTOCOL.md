# Task Review Gate Protocol

**Status:** Active | **Effective:** 2026-09-25 | **Owner:** @reviewer

## Purpose

Prevent unreviewed work from being marked complete. Every task that produces
code, infrastructure config, or implementable design specs must pass a reviewer
gate before `kanban_complete` is called.

## Two-Tier Gate

### Tier 1 — Reviewer Required (must pass @reviewer before complete)

All tasks whose output is **executable or implementable**:

| Category | Examples |
|---|---|
| Code implementation | Creator feature builds, bug fixes, schema changes |
| Infrastructure | Flutter builds, resource configs, deployment scripts |
| Design specs for implementation | Designer specs that creator will build from |
| Security/quality gates | Reviews, audits, scans |

### Tier 2 — Self-Review Sufficient (no reviewer gate)

Tasks whose output is **analytical or coordinative**:

| Category | Examples |
|---|---|
| Research reports | Market analysis, competitor reconnaissance, literature review |
| Documentation | Process docs, runbooks, meeting notes |
| Coordination | Standups, backlog grooming, sprint planning |
| Pure UX exploration | Design exploration not tied to an implementation task |

**Exception:** A Tier-2 task whose output feeds a Tier-1 task gets escalated
to Tier 1. Example: a design spec that creator will implement → Tier 1.

## Protocol Flow

### Tier 1 (Reviewer Gate)

```
running → REVIEW → done        (approved)
running → REVIEW → running     (changes requested)
```

1. **Implementer signals readiness:**
   - Bot calls `kanban_comment(task_id, "🔍 READY FOR REVIEW: <one-line summary>")`
   - Bot does NOT call `kanban_complete` yet
   - Bot optionally moves task to `review` column

2. **Reviewer claims and reviews:**
   - Reviewer reads the task body, diff (if code), artifacts, acceptance criteria
   - Reviewer runs the relevant checklist (security scan, tests, artifact check)
   - Reviewer captures findings as kanban comments with severity ratings

3. **Reviewer verdict:**
   - **Approved:** Reviewer comments `✅ APPROVED — <optional notes>` and the
     original bot calls `kanban_complete`
   - **Changes requested:** Reviewer comments `🔄 CHANGES REQUESTED — <specific items>`
     and moves task back to `running`

4. **Implementer acts on verdict:**
   - Approved → call `kanban_complete` with artifacts and summary
   - Changes requested → fix issues, re-signal readiness (back to step 1)

### Tier 2 (Self-Review)

1. Bot verifies deliverables exist (files written, artifacts attached)
2. Bot checks acceptance criteria are plausibly met
3. Bot calls `kanban_complete` directly
4. No reviewer gate — but bot should leave a brief self-review note in the
   completion summary

## Reviewer Checklist (Tier 1)

### Code tasks
- [ ] Diff reviewed — no unintended changes
- [ ] Security scan run (hardcoded secrets, injection, auth bypass)
- [ ] Tests exist and pass (or rationale for missing tests)
- [ ] Acceptance criteria met
- [ ] Artifacts attached (if applicable)
- [ ] No debug logging / commented-out code left behind

### Infrastructure tasks
- [ ] Config validated against environment
- [ ] No hardcoded secrets or credentials
- [ ] Rollback path exists or is documented
- [ ] Acceptance criteria met

### Design spec tasks (for implementation)
- [ ] Spec is actionable — a developer could build from it
- [ ] Edge cases covered
- [ ] Acceptance criteria met

## Capacity & Scaling

- One reviewer can handle 2–3 parallel reviews if each is scoped to a focused
  checklist
- Reviews should be lightweight — not a full re-implementation
- If review queue builds up, the manager prioritises by dependency criticality
  (tasks blocking other bots go first)

## Escalation

- If reviewer and implementer disagree on a finding, the manager decides
- If reviewer is unavailable (blocked/unassigned), the manager temporarily
  assigns review to another qualified profile
- If a task is urgent and the gate would cause unacceptable delay, the manager
  can approve a one-time bypass with a documented reason — but this is rare
- **Model-outage break glass:** When API rate limits or provider outages prevent
  the reviewer from getting a model to perform a review, the manager may
  temporarily relax the Tier 1 gate for a defined window (e.g. 30 minutes).
  Tasks completed during a break-glass window must be reviewed retroactively
  once model availability returns. The break-glass period and reason are logged
  as a kanban comment on the protocol task (t_395d55bc).

## Documentation

This protocol lives in `platform/REVIEW_GATE_PROTOCOL.md` (this file). Updates
go through the reviewer or manager. Changes are announced in the next standup.
