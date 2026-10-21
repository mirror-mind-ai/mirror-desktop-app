[< Project roadmap](../roadmap/index.md)

# Refinement Workbench

This index is the canonical project record for Refinement Story and Change Request
backlog status for `mirror-desktop-app`. Linked documents preserve context and
evidence; they do not own status. If a linked document and this index disagree,
this index wins.

The Workbench was opened empty on 2026-10-21, before the first Delivery Story was
pulled. It holds the small work that is not a story: a defect found in use, a
one-off correction, a request that arrives mid-session, and the groupings that
form around them. [CV1](../roadmap/cv1-daily-use/index.md) depends on it: the
defects a week of daily use surfaces are captured here, not as missing stories.

The predecessor's Workbench, in `mirror-mind-ai/mirror-desktop`, stays in that
repository as [predecessor](../history/predecessor.md) evidence. None of its
records were imported, and its identifiers mean nothing here.

## Current Focus

- Refinement Story: —
- Change Request: —

Selecting a focus is an explicit project decision. Reading this file never selects
or executes work.

## Refinement Stories

| Order | ID | Story | Status |
|------:|----|-------|--------|
| 1 | [RS001](rs001-host-ui-contract/index.md) | Host–UI Contract | proposed |

## Change Requests

Open work is ordered intentionally. Terminal history follows open work.

| Order | ID | RS | Change | Status | Driver | Delivery |
|------:|----|----|--------|--------|--------|----------|
| 1 | [CR001](rs001-host-ui-contract/cr001-a-message-that-breaks-the-protocol-is-dropped-silently.md) | RS001 | A message that breaks the protocol is dropped silently, and the request behind it never settles | captured | — | — |

## Status Vocabulary

Refinement Story:

```text
proposed | active | parked | closed
```

Change Request:

```text
captured | planned | in_progress | blocked | validated | done | parked | rejected | promoted
```

Detailed phase history belongs in the CR document. The index records only the
current canonical status. `blocked`, `parked`, `rejected` and `promoted` carry a
reason in the CR document; `parked` also names a revisit trigger, and `promoted`
names its Delivery Story. Status is document vocabulary, not an application state
machine.

## Collaboration Convention

- `Driver` names one accountable human contributor, preferably by GitHub handle. It
  never names a Mirror persona, Journey, runtime session or database identity.
- `Delivery` is a pull request link when one exists, otherwise a backticked Git
  branch. It never contains an absolute path, a local worktree, a conversation ID
  or a Journey UUID.
- The canonical empty value is `—`. A `captured` or `planned` CR may be unassigned.
- An `in_progress`, `blocked` or `validated` CR records both Driver and Delivery.
- Assignment and reassignment are explicit Navigator decisions, never inferred from
  the current checkout, the latest committer or private runtime state.
- When a pull request opens, its link replaces the branch reference.
- Terminal history keeps Driver and Delivery as provenance.

## Artifact Convention

- IDs are stable, project-wide `RSNNN` and `CRNNN` identifiers, numbered from
  `RS001` and `CR001` in this repository.
- IDs never encode a Journey, database, person, absolute path or runtime display
  code.
- Each RS owns one directory, `rsNNN-slug/`, with an `index.md`.
- Each CR is one evolving Markdown document, `crNNN-slug.md`, inside its RS
  directory, with the sections `Problem`, `Expected Behavior`, `Impact`,
  `Plan Or Decision`, `Evidence` and `Outcome`.
- A new capture names its RS explicitly. Empty files for lifecycle phases are not
  created.
- Git owns history, collaboration, conflict resolution and recovery. No document
  grants commit, push, merge, publication or release authority.
- This file and its linked documents are the sole Refinement authority. SQLite is
  never consulted or written for Refinement Work.
