import type { Journey } from "@mirror-desktop/protocol";
import { describe, expect, it } from "vitest";

import { type JourneyNode, journeyTree } from "./tree.ts";

const journey = (id: string, name: string, extra: Partial<Journey> = {}): Journey => ({
  id,
  name,
  status: "active",
  description: "",
  ...extra,
});

/** The tree as lines, depth-first, each indented by its level: what a person reads down the sidebar. */
function outline(nodes: readonly JourneyNode[]): string[] {
  return nodes.flatMap((node) => [`${"  ".repeat(node.level - 1)}${node.journey.name}`, ...outline(node.children)]);
}

describe("journeyTree", () => {
  it("orders siblings as the Mirror core does: by name, lower-cased, compared by code unit", () => {
    // Listed by key, as the host lists them, so the names arrive out of order.
    // The expected outline is the core's own: listJourneyOptions over the same
    // rows printed exactly this (recorded in US1's validation evidence).
    const listed = [
      journey("a-zinnia", "Zinnia"),
      journey("b-ecoles", "écoles"),
      journey("c-mango", "Mango"),
      journey("d-apple", "apple"),
      journey("e-banana", "Banana"),
      journey("f-seed", "Seed", { parent: "d-apple" }),
      journey("g-sprout", "Sprout", { parent: "f-seed" }),
      journey("h-root", "root", { parent: "d-apple" }),
    ];
    expect(outline(journeyTree(listed))).toEqual([
      "apple",
      "  root",
      "  Seed",
      "    Sprout",
      "Banana",
      "Mango",
      "Zinnia",
      "écoles",
    ]);
  });

  it("shows only active Journeys, and stands an active child of a hidden parent at the root", () => {
    const listed = [
      journey("attic", "Attic", { status: "paused" }),
      journey("beds", "Beds", { parent: "garden" }),
      journey("garden", "Garden"),
      journey("loft", "Loft", { parent: "attic" }),
    ];
    expect(outline(journeyTree(listed))).toEqual(["Garden", "  Beds", "Loft"]);
  });

  it("counts levels from 1 at the root, as aria-level does", () => {
    const tree = journeyTree([journey("garden", "Garden"), journey("beds", "Beds", { parent: "garden" })]);
    expect(tree[0]?.level).toBe(1);
    expect(tree[0]?.children[0]?.level).toBe(2);
  });

  it("ends a parent link that loops, showing each Journey of the loop once, at the root", () => {
    const listed = [
      journey("x", "Xylem", { parent: "x" }),
      journey("a", "Alder", { parent: "b" }),
      journey("b", "Birch", { parent: "a" }),
      journey("c", "Cedar", { parent: "a" }),
    ];
    // Cedar is not in the loop: its parent is shown, so it stays under it.
    expect(outline(journeyTree(listed))).toEqual(["Alder", "  Cedar", "Birch", "Xylem"]);
  });

  it("is empty when no Journey is active, or there are none", () => {
    expect(journeyTree([journey("attic", "Attic", { status: "paused" })])).toEqual([]);
    expect(journeyTree([])).toEqual([]);
  });
});
