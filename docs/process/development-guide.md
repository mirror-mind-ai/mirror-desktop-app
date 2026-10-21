[< Documentation](../index.md)

# Development Guide

How we work on Mirror Desktop. This is an operating agreement, not a style
guide: it describes how a Builder session moves from intention to a verified
change while process, project and product stay coherent.

It does not repeat the repository's rules. [AGENTS.md](../../AGENTS.md), which
every agent loads, is authoritative for commands, layout and the always-on
rules: test first, the protocol as the contract, Mirror at its public surface
and through its front door, small commits that explain why. The
[decisions](../project/decisions.md) bind both documents. When this guide and
AGENTS.md disagree, correct the wrong one in the same commit as the work that
found it.

---

## Operating Model

**The person is the Navigator. The agent is the Driver.**

This is pair programming, adapted. The Driver operates the codebase: reads,
questions, proposes, implements, flags drift, prepares validation routes and
stops at checkpoints. The Navigator holds intent and product judgment, decides
trade-offs, and is the only one who validates.

The Driver does not disappear into implementation. Noticing drift is part of
the role: code that no longer matches the roadmap, docs that describe a state
the product does not have, a session following a process other than this one.

## Lineage

From XP: the Driver/Navigator pair, test-driven development, refactoring,
small increments, simple design. From Lean and Kanban: WIP discipline. Scope
found in the middle of a story is captured for later unless correctness or
coherence needs it now; unfinished scope is invisible load. From Ariad
([adoption](../project/roadmap/ariad-adoption.md),
[D12](../project/decisions.md#d12--ariad-governs-the-roadmap-from-the-first-delivery-story)):
an explicit lifecycle with checkpoints, so that an agent's speed does not turn
into fast entropy.

---

## Progress Taxonomy

The [roadmap](../project/roadmap/index.md) runs **Capability Value → Delivery
Story → Story**. Refinement Work and Core-owned prerequisites run beside it.

### Value: Capability Value (CV)

A stage with an outcome a person can see: CV1 Daily Use, CV2 First Run. A CV
gets its folder and Delivery Stories when it is next; the ones after it stay
named horizons.

### Progress: Delivery Story and Story

A **Delivery Story** (`CV1.DS1`) is a cohesive block with a done condition and
a table of candidate stories. Ariad reads that table by its header
(`| Code | Story | Type | Outcome | Status |`), so the header keeps that shape.

A **User Story** or **Technical Story** (`CV1.DS1.TS1`) is the implementable
unit. Its package lives in the Delivery Story's folder and grows from the
[templates](../project/roadmap/templates/):

- `index.md`: the story, its outcome, acceptance behavior and scope;
- `plan.md`: what is in and out, the approach, how it will be tested and
  validated;
- `test-guide.md`: the automated checks, the Navigator's route and the
  evidence.

Validation, Debt Review, Coherence and Done add their own records
(`validation.md`, `review.md`, `coherence.md`, `done.md`), which Ariad writes
and seals. A record a person has edited is kept as they left it.

### Refinement Work: RS and CR

Work that is real but does not move the roadmap, such as a defect found in
use, a one-off correction or a request that arrives mid-session, is a Change
Request inside a Refinement Story, in the
[Refinement Workbench](../project/refinement/index.md). CV1's done condition
sends the defects of daily use there. Do not inflate maintenance into a story
to make it visible, and do not hide product work in a CR to skip the
lifecycle.

### Core-owned prerequisites

A capability the Mirror core does not expose yet is not built here. It goes
into the [prerequisites ledger](../project/history/predecessor.md#core-owned-prerequisites),
is implemented in the Mirror repository with its own tests and release, and is
consumed here only after that. A story that depends on one names it in its
plan. While it waits, no Mirror behavior is forked; a reach past the public
surface stays in `packages/host/src/mirror.ts` and in the ledger.

### Work: tasks and maintenance

The concrete change: a file, a test, a decision, a dependency bump. Most of it
lives inside a story or a CR. A meaningful milestone outside both goes to the
[worklog](worklog.md).

---

## Discovery

Not all work starts as a story. When the question is what to build, or
whether something can work at all, the work is discovery: a
[spike](../project/spikes/) or an [exploration](../project/explorations/).

A spike is a question, not a story (D12). It ends in a measured answer, and
its findings become decisions and prerequisites; CV0 is the model. Discovery
collapses into decidability, not necessarily into code. Do not force it into a
story before the implementation boundary is clear.

---

## Opening a Session

Activating Builder Mode for `mirror-desktop` loads context and stops there; it
is not consent to implement (AGENTS.md). Before non-trivial work the Driver
asks three questions, and shares the answer when it changes the route:

1. **Blocked by ambiguity?** Expand: read, separate concerns, name the
   options.
2. **Lost in fragments?** Collapse: relate the parts, update status, name the
   value.
3. **Flowing?** Continue the current lifecycle step.

Before writing code, the Driver reads the code and its neighbors, because the
code, not the docs, is the truth about behavior. Then it places the work as a
story, a CR, a prerequisite or maintenance, and says why; writes the plan; and
waits for the Navigator. If the direction is unclear, stop and ask. Guessing
is not momentum.

---

## Story Lifecycle

```text
Pull → Prepare → Expand → Plan → Implement → Validate → Debt Review → Coherence → Done
```

The `mirror build` runtime holds the cursor and prints a surface at each step.
Surfaces reach the Navigator verbatim; the Driver's reading comes after them.
The cadence is `stepwise` unless the Navigator changes it.

### 1. Pull and Prepare

The Navigator chooses what to pull; a candidate never starts itself. Prepare
reads the terrain: the docs present, the story's shape, the risks.

### 2. Expand and the flow unit

A pulled Delivery Story expands into its story packages. Right after, the
Navigator chooses how it runs:

- `story_by_story`: each story is pulled, planned, validated and closed on its
  own;
- `delivery_story`: one plan for the whole Delivery Story, validated at the
  end, with the stories kept as traceable work packages.

Ariad accepts this choice only at that moment, before any plan, so the Driver
asks it and never assumes it.

### 3. Plan

Expand and Plan write scaffolds: template sentences with the title pasted in.
A scaffold is not a plan. The Driver writes the story's `index.md` and
`plan.md` for real, in the Navigator's language, including whether an
end-to-end run is required, and presents them section by section.
Implementation stays blocked until the Navigator approves.

### 4. Implement

In focused slices, test first. A new capability follows the protocol's order:
its schema and test, then the host, then the UI. UI tests run against the fake
host that
[CV1.DS1.TS1](../project/roadmap/cv1-daily-use/cv1-ds1-the-conversation-shell/index.md)
builds: no Pi, no model, no network. Scope that appears along the way becomes
a CR, a later story or a prerequisite; it is not absorbed silently.

### 5. Validate

The Driver runs the [gates](#verification), completes `test-guide.md` with
commands to copy and the results to expect, and prepares a validation route
for the Navigator: what to run, what to open, what to do, what to observe, and
what is consciously left out. The route turns an implementation into something
the Navigator can check alone.

Offering a route is not acceptance. A change a person can see does not close
on green tests alone; only the Navigator accepts, or waives, the validation.

### 6. Debt Review

At the end of every story: what design debt did it create? What fits is paid
inside the cycle. What does not goes to the
[technical debt ledger](../project/roadmap/technical-debt-ledger.md) with the
reason it was deferred and a revisit trigger. Deferred debt with no entry was
discarded, not deferred.

### 7. Coherence and Done

Coherence asks what was forgotten, across process, project and product: story
and roadmap status at every level touched, the worklog, a decision that became
stable, the docs a change affected, and the agreement between code, plan and
docs. Done then names the history action, the roadmap update and the next
movement. Ariad refuses Done while the story's `index.md` is still a scaffold.

---

## Pause Discipline

Non-trivial work stops for real at four checkpoints:

1. after the plan;
2. after the gates and the validation route;
3. after Debt Review;
4. before a push.

Between checkpoints the Driver works without asking about every file. A "go
ahead" releases the work up to the next checkpoint, not through the rest of
the lifecycle.

Stop and ask, saying what, why and the risk, before:

- adding a dependency the plan did not name;
- deleting, skipping or weakening a test;
- running a real turn against a Journey the Navigator did not name, since it
  writes to their Mirror;
- touching signing, the embedded runtime, the bundle identifier or anything a
  release would ship;
- any push, tag or release;
- widening the scope beyond what was asked.

---

## Verification

There is no CI yet, so the local gate is the only gate. Run it before a story
goes to validation and before any push. From the repository root, every code
change runs:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Then whatever the change touched:

| Touched | Also run |
|---|---|
| The Rust shell, `apps/desktop/src-tauri/` | `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` |
| How the host drives Pi or Mirror | One real turn: `npm run turn --workspace packages/host -- --journey <slug> --prompt "…"` |
| Provider sign-in | The login script under a scratch `HOME`, as in AGENTS.md ([spike 3](../project/spikes/spike-3-in-app-provider-login.md)) |
| The bundle, or anything it stages | `npm run bundle --workspace apps/desktop`, then launch the built app ([spike 2](../project/spikes/spike-2-clean-machine-bundle.md)) |

A real turn runs on the person's own Pi directory and Mirror home: Mirror's
extension logs the conversation into their memory, and the session lands in
`~/.pi/agent/sessions/` ([spike 1](../project/spikes/spike-1-host-prototype.md)).
It is a Navigator-visible act, not a scratch run.

A gate that fails for a known, pre-existing reason is recorded in the story's
test guide. It is never treated as green in silence.

---

## Commits and Push

The commit rules are in AGENTS.md: small commits in English that explain why,
the coherent changes of each turn committed before reporting completion, and
docs in the same commit as what they describe. Beyond them:

- one concern per commit;
- never skip hooks with `--no-verify`, and never amend or rewrite a pushed
  commit;
- work lands on `main`, and a push is the Navigator's decision. Ariad never
  pushes.

---

## Docs Maintenance

| Changed | Update |
|---|---|
| Positioning, setup, layout | [README.md](../../README.md) |
| Commands, repository rules, shape | [AGENTS.md](../../AGENTS.md) |
| A stable premise | [briefing](../project/briefing.md), and only through a recorded decision |
| A decision | [decisions](../project/decisions.md): the next `D<n>`, newest last |
| CV, Delivery Story or story status and packages | [roadmap](../project/roadmap/index.md) |
| A defect or correction outside a story | [Refinement Workbench](../project/refinement/index.md) |
| Deferred debt | [technical debt ledger](../project/roadmap/technical-debt-ledger.md) |
| A Core-owned prerequisite, or a reach past Mirror's public surface | [predecessor](../project/history/predecessor.md#core-owned-prerequisites) |
| A meaningful milestone | [worklog](worklog.md) |
| A new document | the [documentation map](../index.md) |
| How we work | this guide |

---

## Known Gaps

Named so they are not assumed away:

- **No CI.** No workflow runs on push; the local gate is the whole proof.
- **No UI rendering tests.** Nothing renders a component under test until
  CV1.DS1.TS1 brings the fake host and happy-dom.
- **No Rust tests.** The shell is checked by `cargo check` only.
- **No linter or formatter.** Style rests on review.
- **No isolated real turn.** A real turn writes to the person's Mirror and
  Pi, and no scratch setup for the host has been proven yet. Sign-in has one.

Closing a gap is roadmap or Workbench work, pulled like any other.

---

## What We Have Learned

- **Boundaries breed reconciliation.** Most of the first body's open defects
  were symptoms of its process boundaries. The fix was a design where those
  boundaries do not exist, not better reconciliation
  ([D2](../project/decisions.md#d2--one-long-lived-node-host-the-shell-stays-thin),
  [predecessor](../project/history/predecessor.md)).
- **An agent follows the code in front of it.** That is why the second body is
  a new repository and not a branch beside 14k lines of the old design
  ([D1](../project/decisions.md#d1--the-second-body-is-a-new-repository)).
  Code from the first body is copied deliberately, with provenance, or not at
  all.
- **Answer the questions that could sink the design before building on them.**
  CV0 settled four with running code before the first story was pulled.
- **Small stories validate faster.** A story that cannot be verified end to
  end in one session is probably too big.
- **Coherence is not polish.** It is what lets a repository remember itself.

---

**See also:** [AGENTS.md](../../AGENTS.md) · [Briefing](../project/briefing.md) ·
[Decisions](../project/decisions.md) · [Roadmap](../project/roadmap/index.md) ·
[Refinement Workbench](../project/refinement/index.md) ·
[Technical debt ledger](../project/roadmap/technical-debt-ledger.md) ·
[Worklog](worklog.md)
