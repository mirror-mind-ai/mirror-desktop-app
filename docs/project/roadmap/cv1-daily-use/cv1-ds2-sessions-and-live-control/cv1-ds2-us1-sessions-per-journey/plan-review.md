[< Story](index.md)

# Plan Review — CV1.DS2.US1

**Date:** 2026-10-29
**Reviewed:** the first version of the plan, the story and the test guide, as committed in `3994ac8`.
**Outcome:** the plan was revised with the nineteen defects below and the Navigator's rulings on R1–R3, each the recommended option; the current version is [plan.md](plan.md), approved on 2026-10-29.

## How it was reviewed

Four lenses were chosen for what this plan puts at risk:

- **engineer**, for the host's new seam (an index of a folder, a file
  projected onto rows, a resume through Pi's own manager), the store's
  state model with a second asynchronous read, the protocol's shape, and
  the invariant "one open session per Journey";
- **quality-assurance**, for whether each scenario is proven against
  written files and the fake host, the races a second read opens, and
  whether the route can be judged alone;
- **experience-designer**, for the header's new inhabitant, the words the
  story adds beside US1's and US3's, the transitions between a pick and a
  transcript, and the bound's line;
- **security-engineer**, for the first requests in which the webview
  names a file the host reads, the containment of that read, what crosses
  the socket, and fixture content in a new channel.

Database-architect was left out: Mirror's behavior on resume was read
from its source and no schema is touched. Devops-engineer was left out:
nothing in the runtime's operation changes. Product-designer was left
out: the cut was made in DS2's candidate table and Planning Inputs.

Each ran as an isolated reviewer (`pi -p` with the persona's full identity
from Mirror as the system prompt, no tools, no session, no extensions, no
skills, no context files, nothing logged to Mirror). Each saw the plan,
the story, the test guide, the Delivery Story with its Planning Inputs,
the repository rules, the development guide's lifecycle and verification
sections, D7, D14 and D16, the debt ledger, the code the story touches
(protocol, host sessions, server and Mirror seam, conversations store and
transcript, Conversation, Composer, the Escape hook, Shell, host client),
the test harness (fake host, worlds, turns, the conversation tests), the
Pi 1.4.0 session manager's declarations, Mirror 0.38.0's
`bindConversationContext`, and the Driver's measurement of `list()`.

The Driver then verified the sharpest claims:

- **Pi's own list does not filter by the header's cwd on the default
  folder** (`session-manager.js`, `list`: `filterCwd` is false when no
  session directory is given); only `findMostRecentSession` filters, and
  it excludes an old file with an empty header cwd. The plan's D1 filter
  would have listed fewer sessions than `pi -r`, against its own goal.
- **The model and thinking level are restored from the file**
  (`sdk.js`, `createAgentSession`: the branch's last `model_change` when
  its provider is signed in, and the last `thinking_level_change`), so
  validation step 4 can expect them in the header.
- **Showing a session costs a whole-file load.** `SessionManager.open` on
  the 75 MB file: 175 ms and 208 MB, 1,912 branch entries, the largest
  entry 1.37 MB (a tool result). Fast enough for a look; the memory is
  transient; a per-entry byte cap is needed, since 200 entries is not a
  size bound.
- **zod strips unknown keys**, so an old host given `sessionFile` on
  `session.open` would silently open a fresh session, not refuse. The
  version bump at hello is the guard; the plan's `malformed_request`
  wording was wrong for the field.
- **Mirror reuses a conversation that has not ended.**
  `bindConversationContext` (Mirror 0.38.0) returns the bound
  conversation when `ended_at` is NULL and updates its `journey`. The
  plan's "a new conversation on resume" holds for an ended one, which a
  clean quit or `session_shutdown` leaves; a terminal session still open,
  or a host that died, leaves one that resume would continue and
  re-journey.
- **The transcript opens at its end**: `Transcript.tsx` scrolls to the
  bottom in a layout effect, so a read transcript lands on its last rows.
- **`BashExecutionMessage` carries `command`, `output` and `exitCode`**,
  enough for a tool row.
- **The plan contradicted itself** on the list while a turn runs:
  "disabled" in D6 and the acceptance, and in the same scope an Escape
  test and route step 9 that open it during a held turn.

## Navigator rulings

The Navigator took the Driver's recommendation on every decision.

| Decision | Options | Recommendation, ruled |
|---|---|---|
| R1 — where "one open session per Journey" lives (engineer 4, 5; quality-assurance 4; security 9) | (a) in the UI, as planned: a pick closes the open session first, a failed close is toasted and the old session leaks until quit; (b) in the host: `session.open` for a Journey closes that Journey's open session before opening, in one request, and a pick only shows; (c) the host refuses an open while one is open and the UI must close first | **(b)**: the invariant lives where the sessions live; no close-then-open window, no failure toast, no leak; and a pick becomes a pure look, so D14 is kept more strictly than the plan had it: looking at another session closes nothing, the next send does |
| R2 — the list while a turn runs (quality-assurance 1; experience-designer 3) | (a) the button disabled, the hint in its `title`; the Escape-on-open-list test then has no turn to protect and route step 9 is cut; (b) the list opens, its options are disabled, and a visible line in the list says "Pi is answering. Pick a session when it finishes."; Escape closes it with the default prevented, so the turn goes on | **(b)**: looking is free (D14), the hint is visible rather than a tooltip on a control that takes no focus, and the overlay rule gets a real test and a real route step |
| R3 — D1, the shared list, ratified with its consequences (engineer R3; experience-designer R1; security 8) | (a) the folder's sessions, as `pi -r` lists them, with two consequences written down: two Journeys sharing a project path share a list, and resuming a session under the other Journey binds its new Mirror conversation to that Journey; the same file open twice is refused by the host; (b) only the sessions Mirror bound to this Journey | **(a)**, with the consequences in D1 and the refusal in D4; (b) hides the terminal sessions the person most wants to continue |

## The synthesis

**Taken into the plan as defects** (no ruling needed):

1. **No cwd filter in the index; the most recent is the first row.** The
   folder is already per-cwd; Pi's own list trusts it (engineer 1;
   quality-assurance 9).
2. **The bound is on drawable entries, after projection, keeping a tool
   call with its result; the line counts messages.** "Earlier history in
   this session is not shown (n messages)", where n counts the user and
   assistant messages left out (engineer 2; quality-assurance 5;
   experience-designer 4).
3. **A read is guarded by a per-conversation token**, so a read that lands
   after a later pick is dropped; the store test stages the out-of-order
   answer. The `epoch` guard covers resets only (engineer 3;
   quality-assurance 2).
4. **The same file open twice is refused** by the host
   (`session_open_failed`, "already open"), with a registry test; two
   conversations would otherwise share one session id and
   `journeyOfSession` would route to whichever matched first (engineer 5;
   quality-assurance R2).
5. **A named error for a read that fails**, `sessions_unreadable`, with a
   host-composed, bounded message (what failed, in which folder, never a
   raw exception or stack): `failureOf` would otherwise say "The host
   could not complete the request." and the planned screen could never
   show the host's words (engineer 6, R2; security 5, R3).
6. **The version bump is the guard, not `malformed_request`**: zod strips
   an unknown field (engineer 7).
7. **A resume's diagnostics land where the live turn begins**, not above
   the read history; tested (engineer 8).
8. **Containment by realpath**, for `session.transcript` and
   `session.open` alike: both resolved, the file strictly inside
   `getDefaultSessionDir(projectPath)`, a regular `.jsonl` file;
   `sessionFile` without a `journey` is refused; `session.transcript`
   takes the Journey; tests for `..`, a symlink out, another cwd's folder,
   and a listed file deleted before the send (security 1–3, R1;
   quality-assurance 7; engineer 10).
9. **A per-entry byte cap** on text, thinking and results, with a marker
   where it cut, tested with an oversized result; the whole-file load per
   look named as an accepted cost, with the measurement (security 4, R2;
   engineer 9).
10. **Scripted sessions pass the fixture net**: `checkWorld` runs the
    forbidden-content and real-path checks over scripted entries, titles
    and files (security 6, R4; quality-assurance 8).
11. **Titles are content, not chrome**: a plain text node, never Markdown,
    bounded with an ellipsis, control and bidi characters stripped, in the
    muted weight beside the Journey's name (security 7;
    experience-designer 1).
12. **"A new conversation on resume" is qualified**: for a session whose
    conversation ended; one still open is continued and re-journeyed,
    which is `pi -r`'s exposure too; the route's step 4 says which case it
    checks (quality-assurance 3; security 8).
13. **A failed transcript read has its scenario**: the host's words and
    Try again, the composer still sends, and the send resumes the file
    anyway, since the head reader failing does not prove Pi's parse fails
    (quality-assurance 6, R4).
14. **The interim states are named**: while the list or a transcript is
    read, the transcript area shows a Pulse with "Reading the session…"
    and the button says "Sessions…"; after a "New session" send, the
    button names the opened session once the re-read returns
    (experience-designer 6, 8).
15. **The list's shape**: a bounded height that scrolls, the shown session
    in view when it opens, "New session" kept first; the row and the
    button show the modified date, absolute and short ("Oct 29", the year
    when not this one) (experience-designer 2, R2).
16. **Picking the shown session is a no-op**, tested (quality-assurance
    R1).
17. **Images in a read transcript are their alt text**, as D16 draws them
    live; no "or skipped" (experience-designer 5).
18. **"Within a moment" is a number**: on the 760-session folder, the
    list and the most recent session shown within one second
    (quality-assurance R3; experience-designer R4).
19. **`bashExecution` is verified** to carry a command, an output and an
    exit code, which become a tool row's args, result and `isError`
    (engineer 11).

**Not taken:**

- Loading the earlier history a bounded transcript left out, and
  Mirror's titles for sessions: named non-goals; the reviewers did not
  contest them.
- A `lost`-style status or any change to how a dead host is shown: not
  this story's.

## What holds, in the reviewers' words

Every load-bearing claim is sourced to code or measured; the light index
is justified by numbers; D14 survives as pure reads; the read-back
transcript inherits every D16 control by becoming the same rows drawn by
the same renderer; the slice order follows the repository's rule; the
non-goals are crisp; and the split between what the fake host proves and
what only the window with terminal Pi beside it can prove is right.
