[< Parent](../index.md)

# CV1.DS2.US3 — Model and thinking

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a person conversing with Pi in the app,
I want to see which model and thinking level a session runs on, and to choose them for that session from the conversation's header, before its first message or at any point after it, the way `/model` and `/thinking` choose them in terminal Pi,
So that each conversation runs on the model and the depth it needs, without a terminal and without touching Pi's settings.

## Outcome

The conversation's header always says what the session shown will run on
next: its model, as `provider/id`, and its thinking level. For a session
being looked at, that is what resuming it would start with, read from its
file. For a new session, it is Pi's default for the Journey's project, from
Pi's settings. For the open session, it is what the session has. Each is a
control. The model opens a list of the models Pi can use now, with Pi's
default marked. The thinking level opens a list of only the levels that
model supports, each described as Pi describes it.

A choice made before the first send changes nothing until that send.
Looking writes nothing (D14). The send then starts the session on that
choice, or resumes it with it. Looking at another session drops a choice
that was never sent. A choice made on the open session reaches Pi at once.
If a turn is running, Pi applies the choice from its next step, as Ctrl+P
and Shift+Tab do in the terminal. Either way the session file records the
change, so `pi -r` resumes it on the same model and level.

Changing the model keeps the thinking level when the new model supports
it. When it does not, the level moves to the nearest one it does support,
by Pi's own rule. A model or a session Pi cannot use is said in the host's
words, and nothing is half-applied. Pi's settings are never written: the
default stays what terminal Pi says it is.

## Acceptance Behavior

```text
Given a Journey whose most recent session was last run on one model and level
When the person picks the Journey
Then the header shows that model and level, read from the file, and nothing opens

Given a new session shown in a Journey
When nothing has been chosen
Then the header shows Pi's default model and thinking level for the Journey's project, from Pi's settings

Given the session shown is not open yet
When the person picks a model and a thinking level from the header's lists
Then the header shows them and nothing is sent to the host
And the first send opens the session on them, and the header then shows what the host says the session runs on

Given a choice made for a session that was never sent
When the person shows another session and comes back
Then the choice is gone and each session shows its own model and level

Given the open session shown, idle or answering
When the person picks another model or level
Then Pi applies it from its next request, the header shows it at once, and the session's file records it, so pi -r resumes the session on it

Given a thinking level the newly picked model does not support
When the model changes
Then the level moves to the nearest one the model supports, the next one up when there is one, as Pi clamps it

Given a model Pi cannot use (no credential, no longer known)
When it is picked for the open session, or a send opens a session on it
Then the host refuses it in its own words; the header keeps what the session runs on, or the message is back in the draft and the conversation says why the session did not open

Given the model or thinking list open while a turn runs
When the person presses Escape
Then the list closes and the turn goes on

Given any choice made in the app
When the person looks at Pi's settings
Then the default model and thinking level are unchanged
```

## Scope

- The protocol: each available model carries the thinking levels Pi
  supports for it. A Journey's session list carries what a new session
  starts with. A session's read carries what resuming it starts with.
  `session.open` takes a model and a thinking level. A new
  `session.configure` changes them on an open session. A new error code
  names a model Pi cannot use.
- The host: Pi's start rule read with Pi's own pieces. A choice applied at
  open, as `pi --model … --thinking …` would start a session or `/model`
  would continue a resumed one. A change applied in turn with prompts,
  session-only. Pi's fallback message said when a file's model cannot be
  restored.
- The UI: the models kept by the host store. The choice per session shown,
  with its rules pure. The header's two lists, sharing the sessions list's
  listbox behavior.
- The fake host: the defaults, a file's own model and level, the choice at
  open, `session.configure`, and the disk keeping what each session runs on.

## Out Of Scope

- Setting Pi's default model or thinking level from the app. That remains
  terminal Pi's job.
- Scoped models (`enabledModels`) and the cycling keys (Ctrl+P, Shift+Tab).
- Pi's per-model thinking settings applied when the model changes.
- A model or level that an extension or a virtual model's routing sets,
  shown as it changes.
- Each session's model in the sessions list. A search in the model list.
- Signing out, and provider catalogs refreshed on demand.
- Any change to the Mirror core or the Rust shell. What reconnects and
  restarts stays CV1.DS2.TS1's.

## Validation

Every behavior above has a test. The protocol has its schemas. The host's
rules are tested against stubs of Pi's settings, models and session. The
store is tested against a stub connection, and the header against the fake
host. The Navigator validates in the window on a Journey they name, with
terminal Pi's `pi -r` footer as the witness of what the session file
records and Pi's settings file as the witness that nothing changed it, by
the route in [plan.md](plan.md#validation-route) and
[test-guide.md](test-guide.md).
