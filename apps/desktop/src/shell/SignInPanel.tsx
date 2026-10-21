import { signedIn, useHost } from "../host/store.ts";
import { SignIn } from "../SignIn.tsx";

/**
 * The sign-in panel in the conversation area. `onDone` makes it dismissible
 * (opened from the sidebar's Sign in); without it, it stands while no model
 * can be used, and yields to the conversation once one can.
 */
export function SignInPanel({ onDone }: { onDone?: () => void }) {
  const client = useHost((state) => state.client);
  if (!client) return null;
  return (
    <SignIn
      client={client}
      onSignedIn={() => {
        signedIn();
        onDone?.();
      }}
      {...(onDone ? { onDismiss: onDone } : {})}
    />
  );
}
