import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

describe("layout CSS", () => {
  it("keeps the mobile room viewport from overflowing on first paint", () => {
    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[^}]*max-width:\s*100vw/s);
    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[^}]*overflow-x:\s*hidden/s);
    expect(css).toMatch(/\.room-grid\s*\{[^}]*min-width:\s*0/s);
  });

  it("keeps homepage puzzle cards fixed height with truncated copy", () => {
    expect(css).toMatch(/\.puzzle-card\s*\{[^}]*height:\s*\d+px/s);
    expect(css).toMatch(/\.puzzle-card\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/s);
    expect(css).toMatch(/\.puzzle-card p\s*\{[^}]*-webkit-line-clamp:\s*3/s);
    expect(css).toMatch(/\.card-bottom\s*\{[^}]*min-height:\s*58px/s);
    expect(css).toMatch(/\.tag-row span,\s*\.difficulty\s*\{[^}]*min-height:\s*24px/s);
    expect(css).toMatch(/\.puzzle-card \.tag-row\s*\{[^}]*overflow-y:\s*visible/s);
  });

  it("prioritizes the mobile side-panel chat area", () => {
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.side-panel\s*\{[^}]*order:\s*2/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.host-panel\s*\{[^}]*order:\s*3/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.side-panel\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.side-panel\s*\{[^}]*flex-direction:\s*column/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.chat-section\s*\{[^}]*min-height:\s*clamp\(360px,\s*52vh,\s*540px\)/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.side-panel \.side-section:not\(\.chat-section\)\s*\{[^}]*padding:\s*10px/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.side-panel \.side-section:not\(\.chat-section\) h2\s*\{[^}]*font-size:\s*14px/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.score-list\s*\{[^}]*max-height:\s*150px/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.score-list\s*\{[^}]*overflow:\s*auto/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.notes-section\s*\{[^}]*max-height:\s*150px/);
  });

  it("keeps the room option checkbox compact inside the name dialog", () => {
    expect(css).toMatch(/\.name-dialog input:not\(\[type="checkbox"\]\)\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.name-dialog-check input\s*\{[^}]*width:\s*18px/s);
    expect(css).toMatch(/\.name-dialog-check input\s*\{[^}]*height:\s*18px/s);
  });

  it("keeps the host submit button text on one line while pending", () => {
    expect(css).toMatch(/\.ask-box\s*\{[^}]*grid-template-columns:\s*minmax\(150px,\s*190px\) 1fr 108px/s);
    expect(css).toMatch(/\.ask-box \.primary-button\s*\{[^}]*white-space:\s*nowrap/s);
  });
});
