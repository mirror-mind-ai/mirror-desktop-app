// Queries the shell's UI tests share, reading the screen the way a person does.

import { screen, within } from "@testing-library/react";

/** The element whose whole text is exactly `text`, line breaks included; named in a failure by that text. */
export const exactly = (text: string) =>
  Object.assign((_: string, element: Element | null) => element?.textContent === text, {
    toString: () => `exactly ${JSON.stringify(text)}`,
  });

/** The Journeys navigation in the sidebar. */
export const journeysNav = () => screen.getByRole("navigation", { name: "Journeys" });

/** The sidebar read top to bottom, each Journey indented by its aria-level: what a person sees down the list. */
export function sidebarOutline(): string[] {
  return within(journeysNav())
    .queryAllByRole("listitem")
    .map((item) => {
      const level = Number(item.getAttribute("aria-level") ?? "0");
      const name = within(item).getAllByRole("button")[0]?.getAttribute("aria-label") ?? "?";
      return `${"  ".repeat(Math.max(level - 1, 0))}${name}`;
    });
}

/** The composer's text box. */
export const messageBox = () => screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;

/** The conversation's transcript. */
export const transcript = () => screen.getByRole("log", { name: "Transcript" });
