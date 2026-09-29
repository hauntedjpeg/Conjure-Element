/**
 * Differential test against the engine. Two rules with different selectors
 * target the same element; whichever the browser lets win reveals the true
 * specificity order, with source order breaking ties. Our arithmetic has to
 * predict the winner for every ordered pair.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compareSpecificity, specificity } from "./specificity";

const SELECTORS = [
  "*",
  "li",
  ":is(li)",
  ":where(#item)",
  ".x",
  "[data-state=open]",
  '[data-state="open"]',
  "li:first-child",
  ":not(.missing)",
  ":not(#missing)",
  ":not(ul)",
  "ul li",
  "ul > li.x",
  ".x.y",
  ":is(.x, #item)",
  ":is(.missing, li)",
  ":where(.x).y",
  "#list :where(.x)",
  ".a .l li",
  ".a:has(li) li",
  "li:nth-child(1)",
  "li:nth-child(1 of .x)",
  "li:nth-child(1 of #item)",
  "#item",
  "#list #item",
  "li#item.x",
  ":is(#list, .a) li",
  ":not(:is(#missing, .missing) li)",
];

let container: HTMLElement;
let item: HTMLElement;
let style: HTMLStyleElement;

beforeAll(() => {
  container = document.createElement("div");
  container.innerHTML = `
    <div class="a b">
      <ul id="list" class="l">
        <li id="item" class="x y" data-state="open">item</li>
      </ul>
    </div>`;
  style = document.createElement("style");
  document.head.append(style);
  document.body.append(container);
  item = container.querySelector("#item") as HTMLElement;
});

afterAll(() => {
  container.remove();
  style.remove();
});

/** Which of two rules, written in this order, does the engine apply? */
function engineWinner(first: string, second: string): "first" | "second" {
  style.textContent = `${first} { z-index: 1 } ${second} { z-index: 2 }`;
  const value = getComputedStyle(item).zIndex;
  if (value !== "1" && value !== "2") throw new Error(`Neither rule applied: ${first} / ${second}`);
  return value === "1" ? "first" : "second";
}

describe("specificity agrees with the engine", () => {
  it("every selector in the table matches the element", () => {
    const supported = SELECTORS.filter((selector) => CSS.supports(`selector(${selector})`));
    expect(supported).toEqual(SELECTORS);
    expect(SELECTORS.filter((selector) => !item.matches(selector))).toEqual([]);
  });

  it("predicts the winner for every ordered pair", () => {
    const disagreements: string[] = [];
    for (const first of SELECTORS) {
      for (const second of SELECTORS) {
        const predicted =
          compareSpecificity(specificity(first), specificity(second)) > 0 ? "first" : "second";
        const actual = engineWinner(first, second);
        if (predicted !== actual) {
          disagreements.push(
            `${first} [${specificity(first)}] then ${second} [${specificity(second)}]: ` +
              `engine picked ${actual}`,
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});
