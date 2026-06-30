import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NameDialog } from "../src/App";
import { publicSeedPuzzles } from "../src/data/seedPuzzles";

describe("NameDialog", () => {
  it("renders the create-room dialog as a themed case entry panel", () => {
    const markup = renderToStaticMarkup(
      <NameDialog
        request={{ kind: "create", puzzle: publicSeedPuzzles[1], unlimitedQuestions: false }}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />
    );

    expect(markup).toContain("开案登记");
    expect(markup).toContain("name-dialog-case-strip");
    expect(markup).toContain("CASE-001");
    expect(markup).toContain(publicSeedPuzzles[1].title);
    expect(markup).toContain("玩家席位");
    expect(markup).toContain("不填会以“访客”入场");
    expect(markup).toContain("host-persona-choice");
    expect(markup).toContain("host-choice-art");
    expect(markup).toContain("/assets/host-xiaowai.png");
    expect(markup).toContain("/assets/host-dav.png");
    expect(markup).toContain("/assets/host-guigui.png");
    expect(markup).toContain("普通提问不限次数");
    expect(markup).toContain("name-dialog-limit");
  });
});
