// The app's stores, and how they are written and read.
//
// One Zustand store per concern, in that concern's folder as `store.ts`
// (host, journeys, conversations). Each follows the same rules, so the next
// story's store follows them too:
//
// - The store holds data only, from one `initialState` constant. Its actions
//   are plain functions exported beside it that call `setState`; a component
//   calls an action and never writes to a store itself. Actions that talk to
//   the host take the connection as an argument, so their tests pass a stub
//   and need no DOM.
// - The store registers itself here with its initial state. resetAllStores()
//   puts every store back with `setState(initialState, true)`, replacing the
//   whole state, so a field added later is reset too. UI tests reset through
//   renderApp(); store tests in a beforeEach. A test checks that every
//   `store.ts` registered.
//
// Reading, in a component:
//
// - Select the smallest stable value: `useConversations((s) => s.entries[id])`,
//   not `(s) => s.entries` and not an object built in the selector. A selector
//   that returns a new array or object on every call makes Zustand 5 render
//   forever (useSyncExternalStore sees a new snapshot each time).
// - Derive in the component with useMemo, from selected values:
//   `const tree = useMemo(() => journeyTree(journeys), [journeys])`.
// - A list item subscribes to its own slice (a sidebar row to its Journey's
//   conversation), so a background stream re-renders that row and not the
//   whole sidebar.

import type { StoreApi } from "zustand";

export interface RegisteredStore {
  readonly name: string;
  readonly api: StoreApi<object>;
  readonly reset: () => void;
}

const stores = new Map<string, RegisteredStore>();

/** Called once by each store module, beside its definition. `onReset` runs after the state is replaced. */
export function registerStore<T extends object>(name: string, api: StoreApi<T>, initialState: T, onReset?: () => void): void {
  stores.set(name, {
    name,
    // StoreApi is invariant in its state type; the registry only reads whole
    // states and replaces them with their own initial state, never builds one.
    api: api as unknown as StoreApi<object>,
    reset: () => {
      api.setState(initialState, true);
      onReset?.();
    },
  });
}

/** Every store back to its initial state: before each UI test, and in store tests. */
export function resetAllStores(): void {
  for (const store of stores.values()) store.reset();
}

/** The registered stores, by name. */
export function registeredStores(): RegisteredStore[] {
  return [...stores.values()].sort((a, b) => a.name.localeCompare(b.name));
}
