import { describe, expect, it } from "vitest";
import { resolveOverlayAction } from "../../../../src/app/bootstrap/startApp";

interface ActionElement {
  dataset: {
    action?: string;
  };
  closest: (selector: string) => ActionElement | null;
}

describe("resolveOverlayAction", () => {
  it("returns the delegated action from the nearest action element", () => {
    const actionElement: ActionElement = {
      dataset: { action: "start" },
      closest: () => actionElement
    };
    const childTarget: ActionElement = {
      dataset: {},
      closest: (selector) => {
        expect(selector).toBe("[data-action]");
        return actionElement;
      }
    };
    const overlayRoot = {
      contains: (value: unknown) => value === actionElement
    };

    expect(
      resolveOverlayAction(
        childTarget as unknown as Element,
        overlayRoot as Pick<HTMLElement, "contains">
      )
    ).toBe("start");
  });

  it("ignores delegated elements outside the overlay root", () => {
    const foreignActionElement: ActionElement = {
      dataset: { action: "retry" },
      closest: (selector) => {
        expect(selector).toBe("[data-action]");
        return foreignActionElement;
      }
    };
    const overlayRoot = {
      contains: () => false
    };

    expect(
      resolveOverlayAction(
        foreignActionElement as unknown as Element,
        overlayRoot as Pick<HTMLElement, "contains">
      )
    ).toBeUndefined();
  });
});
