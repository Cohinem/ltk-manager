# Agent evaluation

Repository guidance informed by [Anthropic's prompting article](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1),
reviewed on 2026-09-22. Test whether its model-specific results apply to this repository.

The execution rules are in `AGENTS.md`, under "Task execution". This document is for
maintainers changing those rules or evaluating their effect.

## Comparison procedure

1. Choose completed repository tasks with reviewable outcomes: a frontend behavior change,
   a backend regression, a documentation edit and an investigation requiring no edits. Record
   the starting revision, exact request, allowed files and acceptance checks for each.
2. Run the current instructions and candidate instructions in separate disposable checkouts
   from that revision. Keep the model, effort, tools, permissions and dependencies equal.
   Preserve each run's diff and check output for review.
3. Repeat each case at least three times. Record completion, regressions, scope violations,
   user interventions, elapsed time, tool calls and available usage or billing data. Record
   cache reads separately from fresh input tokens. Mark unavailable measurements as unknown.
4. Compare medians and failed runs. Accept a candidate only when every required behavior and
   check still passes, with no new scope violations. Lower token usage on an incomplete task
   is a failed result. Investigate inconsistent outcomes before adopting the change.

| Case              | Instructions          | Run | Acceptance      | Scope violations | Interventions    | Seconds  | Tool calls | Input / cached / output tokens | Cost                |
| ----------------- | --------------------- | --- | --------------- | ---------------- | ---------------- | -------- | ---------- | ------------------------------ | ------------------- |
| Task and revision | Baseline or candidate | 1-3 | Pass or failure | Count and detail | Count and reason | Measured | Measured   | Measured or unknown            | Measured or unknown |

This procedure has not been run. There are no measurements of these instructions' effect on efficiency.

## Instruction placement

Keep rules used across tasks in the root `AGENTS.md`. Keep language and directory conventions
in scoped files. A reference link states when to read its target. Before adding a rule, check
for an existing rule with the same purpose and edit that source instead.

Model settings and API transport behavior belong to the agent host. A repository instruction
cannot configure them. Any host experiment needs its own comparison with repository
instructions held constant.
