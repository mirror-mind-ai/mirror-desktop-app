import { createContext } from "react";

/**
 * Whether the transcript is following the stream (follow.ts): true while the
 * view is at the latest text, false once the person scrolled up to read.
 * Rows that change their own height mid-stream, such as thinking folding
 * away, read it so content never collapses under the person's eye.
 */
export const Following = createContext(true);
