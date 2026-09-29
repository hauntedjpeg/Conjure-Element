import { describe, expect, it } from "vitest";
import { splitPseudoElement } from "./pseudo-element";
import { compareSpecificity, specificity } from "./specificity";
import { splitSelectorList } from "./split";

describe("splitSelectorList", () => {
  it.each([
    ["a, b", ["a", "b"]],
    [".a:is(.b, .c) > d, e", [".a:is(.b, .c) > d", "e"]],
    ['[title="a,b"], .c', ['[title="a,b"]', ".c"]],
    ["[title='a\\',b'], .c", ["[title='a\\',b']", ".c"]],
    [".a\\,b, .c", [".a\\,b", ".c"]],
    [":not(:is(a, b), c), d", [":not(:is(a, b), c)", "d"]],
    ["  a  ,  ,b ", ["a", "b"]],
    ["", []],
  ])("%j", (input, expected) => {
    expect(splitSelectorList(input)).toEqual(expected);
  });

  it("survives unbalanced input", () => {
    expect(splitSelectorList(".a:is(.b, .c")).toEqual([".a:is(.b, .c"]);
    expect(splitSelectorList(".a), .b")).toEqual([".a)", ".b"]);
  });
});

describe("specificity", () => {
  it.each([
    ["*", [0, 0, 0]],
    ["li", [0, 0, 1]],
    ["ul li", [0, 0, 2]],
    ["ul ol+li", [0, 0, 3]],
    ["h1 + *[rel=up]", [0, 1, 1]],
    ["ul ol li.red", [0, 1, 3]],
    ["li.red.level", [0, 2, 1]],
    ["#x34y", [1, 0, 0]],
    ["#s12:not(foo)", [1, 0, 1]],
    [".foo :is(.bar, #baz)", [1, 1, 0]],
    [":where(#a, .b) c", [0, 0, 1]],
    [":is(a, .b, #c)", [1, 0, 0]],
    [":not(.a, #b)", [1, 0, 0]],
    [".card:has(> img, .x#y)", [1, 2, 0]],
    ["a:hover", [0, 1, 1]],
    ["a::before", [0, 0, 2]],
    ["a:before", [0, 0, 2]],
    [".btn:hover::after", [0, 2, 1]],
    ["li:nth-child(2n+1)", [0, 1, 1]],
    ["li:nth-child(2n+1 of .a, #b)", [1, 1, 1]],
    ["::slotted(.a)", [0, 1, 1]],
    [":host", [0, 1, 0]],
    [":host(.dark)", [0, 2, 0]],
    [":host-context(#app .x)", [1, 2, 0]],
    ["::part(label)", [0, 0, 1]],
    ['[data-state="open"]', [0, 1, 0]],
    ['a[href^="http://a.b/c,d"]', [0, 1, 1]],
    [".a\\:b", [0, 1, 0]],
    ["svg|rect", [0, 0, 1]],
    ["*|*", [0, 0, 0]],
    ["a > b ~ c", [0, 0, 3]],
    [":is(:where(#a), .b)", [0, 1, 0]],
    [":not(:is(#a, .b) c)", [1, 0, 1]],
    ["my-element.x", [0, 1, 1]],
    [".__insp-hover", [0, 1, 0]],
  ])("%s", (selector, expected) => {
    expect(specificity(selector)).toEqual(expected);
  });

  it("swapping a pseudo-class for a marker class preserves specificity", () => {
    expect(specificity(".card:hover .title")).toEqual(specificity(".card.__insp-hover .title"));
  });

  it("compares most significant component first", () => {
    expect(compareSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 1, 0], [0, 0, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 1, 1], [0, 1, 1])).toBe(0);
  });
});

describe("splitPseudoElement", () => {
  it.each([
    [".btn::after", ".btn", "::after"],
    [".btn:hover::after", ".btn:hover", "::after"],
    [".btn::after:hover", ".btn:hover", "::after"],
    [".btn:before", ".btn", "::before"],
    ["input::placeholder", "input", "::placeholder"],
    ["::selection", "*", "::selection"],
    [".a > ::before", ".a > *", "::before"],
    ["li::marker", "li", "::marker"],
    ["x-card::part(label)", "x-card", "::part(label)"],
    ["::slotted(.a)", "*", "::slotted(.a)"],
    [".btn", ".btn", null],
    [".btn:hover", ".btn:hover", null],
    ["a:not(::before)", "a:not(::before)", null],
    ['[data-x="::after"]', '[data-x="::after"]', null],
    [".a::BEFORE", ".a", "::before"],
  ])("%s", (selector, base, pseudoElement) => {
    expect(splitPseudoElement(selector)).toEqual({ base, pseudoElement });
  });
});
