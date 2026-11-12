---
name: brainstorming
description: >-
  Use before creative or ambiguous work when the desired outcome, constraints,
  or success criteria are not yet agreed. Turns a vague request into a small set
  of real options, a recommendation, and one decided next step without reopening
  decisions the user already made.
license: MIT
metadata:
  category: product
  project: detailed-3d-sinking-freighter-game
  last_updated: 2026-11-12
---

# Brainstorming

The purpose of this skill is to reduce uncertainty before expensive work. A
good session ends with a decision, the reason for it, and a next action that a
different agent could execute without asking the same questions again.

This repository already has a product direction. Do not run a generic
discovery workshop when the user has given a detailed mission or has already
approved the scope. Read first, decide what is genuinely open, and move.

## When to use it

Use this skill when at least one of these is true:

- the request has more than one plausible shape and the choice changes the
  implementation;
- the user names a goal but not the trade-off they care about;
- an existing behavior, layout, or workflow would be reopened;
- the work is large enough that a wrong direction would waste a branch;
- a previous attempt failed and the next attempt needs a new frame.

Do not use it for a clear, reversible, single-step edit whose acceptance test is
already stated. Do the edit and report it.

## Inputs to read before the first question

1. The current request and the recent conversation decisions.
2. `AGENTS.md` and `docs/SKILLS.md` for repository rules and current scope.
3. The code, tests, or documents the request touches.
4. Existing evidence in `CI_DEPLOYMENT.md`, `README.md`, and the error ledger.
5. The live behavior if the question is about the running site.

List the facts you found before asking anything. Never ask a question that the
repository, the request, or a previous decision already answers.

## Choose the mode

### Discovery mode

The why, the audience, or the success condition is still unclear. Ask one open
question at a time in the user's own terms. After each answer, play back what
you understood in two or three sentences and ask what is missing. Do not offer
a menu before you know what the user is optimizing for.

### Convergence mode

The mission is detailed, the scope is already approved, or the user has asked
for implementation. Do not force a design document or a question round. State
the material assumptions, choose the smallest reversible path, and execute.
Stop only for a user-only decision: credentials, destructive data changes,
spending, legal or safety constraints, or a scope change that would invalidate
the approved request.

### Hybrid mode

Use discovery for the one decision that could change the build, then switch to
convergence. A detailed request can still contain one unresolved trade-off;
resolve that one and leave the rest as stated assumptions.

## Procedure

### 1. Frame the decision

Write one sentence:

> We are deciding **what** so that **outcome**, subject to **constraint**.

If you cannot fill the three blanks, you are still in discovery mode. Do not
proceed to options until the sentence is meaningful.

### 2. Diverge honestly

Produce two or three real alternatives, not variations of the same answer.
Include the smallest reversible option and, when legitimate, the option of not
building the change. Drop any alternative that:

- contradicts why the user wants the change;
- violates a repository rule or a hard constraint;
- depends on a tool or credential that is not available;
- is only different in naming or visual decoration.

For each surviving option, write one line on what the user gets, one on what it
costs, and one on the main risk. Ground the description in this project: name
the screen, command, file, or workflow it would affect.

Do not show a weak option just to make the recommendation look balanced.

### 3. Converge with a recommendation

Use this table when the choice is non-trivial:

| Option | User value | Cost / risk | Reversible? | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| A | ... | ... | ... | ... |
| B | ... | ... | ... | ... |

Recommend exactly one option. Say why the others do not fit. If the user has
already handed you the how (platform, language, layout, workflow), make the
call and state it as your decision instead of asking them to choose again.

### 4. Ask at most one question

Ask only if the answer would change what gets built. Make the question
specific, explain what the answer changes, and offer concrete choices only
after the user has described the goal. If no such question remains, proceed
with a stated assumption and invite correction.

Never turn process choices (file placement, evidence format, wording) into
questions. Make those calls yourself and say so.

### 5. Close with a decision

End the session with this compact record:

```text
Decision:
Why this option:
Alternatives rejected and why:
Assumptions:
Non-goals:
Next action:
Verification:
```

For a project-sized change, put the durable decision in the repository record
that already owns it: `CI_DEPLOYMENT.md` for delivery evidence, `AGENTS.md` for
a durable rule, or `docs/SKILLS.md` for a skill workflow. Do not invent a new
document hierarchy or a `docs/superpowers/` tree for this repository.

The close is not "sounds good" and not a list of ideas. It is a decision plus
the first executable action.

## Repository-specific rules

- The user's detailed mission is approval to implement unless it explicitly
  asks for a design conversation. Record assumptions and move.
- Prefer the smallest change that proves the outcome. Do not add a framework,
  service, or abstraction because it might be useful later.
- If the work is really several independent projects, say so, propose an order,
  and take the first one only.
- If the request grows past its original boundary, stop, name the new size, and
  get approval for the larger scope.
- For visual questions, describe the actual pixels and the trade-off in text
  first. A browser mockup is optional and only when the look itself is the
  decision.
- A spike is throwaway evidence, not a production implementation. Keeping it
  is a new scope decision.

## Output quality bar

A useful close lets the next agent answer these without reopening the debate:

- what is being built and for whom;
- what is explicitly out of scope;
- which option was chosen and why;
- what is assumed rather than confirmed;
- what command, test, or observation proves it worked.

## Red flags

| Thought | Correction |
| :--- | :--- |
| "I will offer a menu so they can decide" | First find out what outcome they want; a menu before that steers the answer. |
| "I know what they mean" | State the inference as an assumption they can correct. |
| "This is a big change, so I need a design doc" | Size the uncertainty, not the line count. A detailed mission may already be decided. |
| "I should ask about every open detail" | Ask only what changes the build; make process calls yourself. |
| "The user said sounds good" | Approval covers what was shown. Restate the decision before implementation. |
| "The spike works, so ship it" | A spike proves a question. Production still needs tests, docs, and the normal gate. |

## Final checklist

```text
[ ] Read the request, AGENTS.md, docs/SKILLS.md, and the touched code/docs
[ ] Named the real decision and the outcome it serves
[ ] Checked facts before asking questions
[ ] Generated two or three genuinely different options
[ ] Recommended one and explained the rejects
[ ] Asked at most one build-changing question
[ ] Recorded assumptions and non-goals
[ ] Ended with one executable next action and its proof
[ ] Used the repository's existing decision record, not a new hierarchy
```
