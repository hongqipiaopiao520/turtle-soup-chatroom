import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("server deploy script", () => {
  it("is exposed as an npm script and performs the core deployment steps", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const script = await readFile("scripts/deploy-server.sh", "utf8");

    expect(packageJson.scripts?.["deploy:server"]).toBe("bash scripts/deploy-server.sh");
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("APP_ROOT=");
    expect(script).toContain("GIT_ROOT=\"$(git -C \"$APP_ROOT\" rev-parse --show-toplevel)\"");
    expect(script).toContain("git -C \"$GIT_ROOT\" pull --ff-only");
    expect(script).toContain("npm ci --include=dev");
    expect(script).toContain("npm run build");
    expect(script).toContain("pm2 startOrRestart \"$APP_ROOT/ecosystem.config.cjs\" --update-env");
    expect(script).toContain("curl -fsS \"$HEALTH_URL\"");
  });
});
