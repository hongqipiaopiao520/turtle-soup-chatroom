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

  it("keeps the homepage hero cinematic without nested case frames", () => {
    expect(css).not.toMatch(/\.case-hero-panel::before/);
    expect(css).toMatch(/\.case-hero-panel::after\s*\{/);
    expect(css).toMatch(/@keyframes home-rise/);
    expect(css).toMatch(/@keyframes case-scan/);
    expect(css).toMatch(/@keyframes case-file-open/);
    expect(css).toMatch(/@keyframes desk-pin-pulse/);
    expect(css).toMatch(/\.case-desk-visual\s*\{/);
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none/s);
  });

  it("keeps long homepage hero cases inside the case desk", () => {
    expect(css).toMatch(/\.case-file-body h2\s*\{[^}]*font-size:\s*clamp\(40px,\s*6vw,\s*84px\)/s);
    expect(css).toMatch(/\.case-file-body p\s*\{[^}]*display:\s*-webkit-box/s);
    expect(css).toMatch(/\.case-file-body p\s*\{[^}]*-webkit-line-clamp:\s*6/s);
    expect(css).toMatch(/\.case-file-body p\s*\{[^}]*max-height:\s*calc\(1\.58em \* 6\)/s);
    expect(css).toMatch(/\.case-file-body p\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.case-file-body p::after\s*\{/);
    expect(css).toMatch(/@media \(max-width:\s*620px\)[\s\S]*\.case-file-body p\s*\{[^}]*-webkit-line-clamp:\s*4/s);
  });

  it("prioritizes the mobile side-panel chat area", () => {
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.side-panel\s*\{[^}]*order:\s*2/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.host-panel\s*\{[^}]*order:\s*3/);
    expect(css).toMatch(/\.side-summary-grid\s*\{[^}]*min-height:\s*0/s);
    expect(css).toMatch(/\.player-list\s*\{[^}]*max-height:\s*96px/s);
    expect(css).toMatch(/\.score-list\s*\{[^}]*max-height:\s*160px/s);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.chat-section\s*\{[^}]*min-height:\s*clamp\(300px,\s*46vh,\s*500px\)/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.side-panel \.side-section:not\(\.chat-section\)\s*\{[^}]*padding:\s*10px/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.side-panel \.side-section:not\(\.chat-section\) h2\s*\{[^}]*font-size:\s*14px/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.side-summary-grid\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.score-list\s*\{[^}]*max-height:\s*112px/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.score-list\s*\{[^}]*overflow:\s*auto/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.player-list\s*\{[^}]*max-height:\s*112px/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.notes-section\s*\{[^}]*max-height:\s*120px/);
  });

  it("keeps the room option checkbox compact inside the name dialog", () => {
    expect(css).toMatch(/\.name-dialog input:not\(\[type="checkbox"\]\)\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.name-dialog-check input\s*\{[^}]*width:\s*18px/s);
    expect(css).toMatch(/\.name-dialog-check input\s*\{[^}]*height:\s*18px/s);
  });

  it("keeps the themed name dialog usable on mobile", () => {
    expect(css).toMatch(/\.name-dialog\s*\{[^}]*width:\s*min\(100%,\s*720px\)/s);
    expect(css).toMatch(/\.name-dialog-personas label:has\(input:checked\)\s*\{/);
    expect(css).toMatch(/@media \(max-width:\s*620px\)[\s\S]*\.name-dialog-personas\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(css).toMatch(/@media \(max-width:\s*620px\)[\s\S]*\.dialog-actions\s*\{[^}]*flex-direction:\s*column-reverse/s);
    expect(css.lastIndexOf(".name-dialog-personas {\n    grid-template-columns: 1fr")).toBeGreaterThan(
      css.lastIndexOf(".name-dialog-personas {\n  display: grid")
    );
  });

  it("keeps the host submit button text on one line while pending", () => {
    expect(css).toMatch(/\.ask-box\s*\{[^}]*grid-template-columns:\s*178px minmax\(0,\s*1fr\) 116px/s);
    expect(css).toMatch(/\.ask-box \.primary-button\s*\{[^}]*white-space:\s*nowrap/s);
    expect(css).toMatch(/\.segmented-option\s*\{[^}]*white-space:\s*nowrap/s);
    expect(css).toMatch(/\.ask-box textarea\s*\{[^}]*height:\s*44px/s);
    expect(css).toMatch(/\.host-tool-button\s*\{[^}]*min-width:\s*44px/s);
    expect(css).toMatch(/\.host-composer\s*\{[^}]*border-top:\s*1px solid var\(--border\)/s);
    expect(css).toMatch(/\.host-tool-popover\s*\{[^}]*position:\s*absolute/s);
  });

  it("keeps room top status and answer-card controls compact", () => {
    expect(css).toMatch(/\.room-title-meta\s*\{[^}]*flex-wrap:\s*nowrap/s);
    expect(css).toMatch(/\.room-title-meta\s*\{[^}]*white-space:\s*nowrap/s);
    expect(css).toMatch(/\.answer-card\s*\{[^}]*position:\s*relative/s);
    expect(css).toMatch(/\.answer-card-actions\s*\{[^}]*position:\s*absolute/s);
    expect(css).toMatch(/\.answer-card-actions\s*\{[^}]*top:\s*10px/s);
    expect(css).toMatch(/\.answer-answer-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/s);
  });

  it("presents the room page as a detective command desk", () => {
    expect(css).toMatch(/\.room-grid\s*\{[^}]*grid-template-columns:\s*minmax\(300px,\s*30%\) minmax\(520px,\s*1fr\) minmax\(240px,\s*280px\)/s);
    expect(css).toMatch(/\.case-dossier\s*\{[^}]*grid-template-rows:\s*auto auto auto minmax\(0,\s*1fr\) auto auto/s);
    expect(css).toMatch(/\.case-dossier\s*\{[^}]*height:\s*100%/s);
    expect(css).toMatch(/\.case-dossier\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.case-dossier h2\s*\{[^}]*font-size:\s*clamp\(28px,\s*2\.8vw,\s*42px\)/s);
    expect(css).toMatch(/\.case-surface-feature\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.case-surface-feature\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/s);
    expect(css).toMatch(/\.case-surface-feature\s*\{[^}]*min-height:\s*0/s);
    expect(css).toMatch(/\.case-surface-feature\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.case-surface-feature \.surface-text\s*\{[^}]*font-size:\s*clamp\(17px,\s*1\.25vw,\s*22px\)/s);
    expect(css).toMatch(/\.case-surface-feature \.surface-text\s*\{[^}]*overflow:\s*auto/s);
    expect(css).toMatch(/\.case-rule-disclosure\s*\{[^}]*border-top:\s*1px solid rgba\(221,\s*205,\s*158,\s*0\.12\)/s);
    expect(css).toMatch(/\.case-rule-disclosure summary\s*\{[^}]*cursor:\s*pointer/s);
    expect(css).toMatch(/\.case-dossier-stats\s*\{[^}]*align-self:\s*end/s);
    expect(css).toMatch(/\.case-status-strip\s*\{[^}]*grid-template-columns:\s*minmax\(160px,\s*auto\) minmax\(0,\s*1fr\) auto/s);
    expect(css).toMatch(/\.case-status-strip\s*\{[^}]*min-height:\s*70px/s);
    expect(css).not.toMatch(/\.case-status-summary/);
    expect(css).toMatch(/\.host-mini-status\s*\{[^}]*min-width:\s*150px/s);
    expect(css).toMatch(/\.host-empty-state\s*\{[^}]*min-height:\s*220px/s);
    expect(css).toMatch(/\.host-log\s*\{[^}]*min-height:\s*260px/s);
    expect(css).toMatch(/\.question-console\s*\{[^}]*border:\s*1px solid rgba\(216,\s*168,\s*79,\s*0\.18\)/s);
    expect(css).toMatch(/\.question-console-guess\s*\{[^}]*border-color:\s*rgba\(199,\s*109,\s*91,\s*0\.58\)/s);
    expect(css).toMatch(/\.host-assist-tray\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.host-assist-tray\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/s);
    expect(css).toMatch(/\.host-assist-tray\s*\{[^}]*border:\s*0/s);
    expect(css).toMatch(/\.host-hints-history\s*\{[^}]*position:\s*relative/s);
    expect(css).toMatch(/\.host-hints-history-button\s*\{[^}]*white-space:\s*nowrap/s);
    expect(css).toMatch(/\.host-hints-popover\s*\{[^}]*position:\s*absolute/s);
    expect(css).toMatch(/\.host-hints-popover\s*\{[^}]*max-height:\s*min\(260px,\s*48vh\)/s);
    expect(css).toMatch(/\.revealed-hints\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.hint-item\s*\{[^}]*flex:\s*0 0 auto/s);
    expect(css).toMatch(/\.hint-item\s*\{[^}]*white-space:\s*normal/s);
    expect(css).toMatch(/\.side-panel\.auxiliary-rail\s*\{[^}]*grid-template-rows:\s*minmax\(150px,\s*0\.72fr\) auto/s);
    expect(css).toMatch(/\.side-tool-drawer\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.side-tool-drawer\s*\{[^}]*border-top:\s*1px solid rgba\(221,\s*205,\s*158,\s*0\.1\)/s);
    expect(css).toMatch(/\.tool-drawer-section\s*\{[^}]*border-bottom:\s*1px solid rgba\(221,\s*205,\s*158,\s*0\.09\)/s);
    expect(css).toMatch(/\.chat-section\s*\{[^}]*opacity:\s*0\.74/s);
    expect(css).toMatch(/\.chat-section h2\s*\{[^}]*font-size:\s*12px/s);
    expect(css).toMatch(/\.chat-input input\s*\{[^}]*min-height:\s*36px/s);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.puzzle-panel\s*\{[^}]*max-height:\s*clamp\(520px,\s*72vh,\s*720px\)/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.case-status-strip\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.host-mini-status\s*\{[^}]*justify-content:\s*flex-start/s);
  });
});
