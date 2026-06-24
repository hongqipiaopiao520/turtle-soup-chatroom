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
    expect(script).toContain("git_in_dir()");
    expect(script).toContain("git_in_dir \"$GIT_ROOT\" pull --ff-only");
    expect(script).not.toContain("git -C");
    expect(script).toContain("npm ci --include=dev");
    expect(script).toContain("npm run build");
    expect(script).toContain("pm2 startOrRestart \"$APP_ROOT/ecosystem.config.cjs\" --update-env");
    expect(script).toContain("curl -fsS \"$HEALTH_URL\"");
  });

  it("provides a docker deploy path that does not require host node or npm", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");
    const script = await readFile("scripts/deploy-docker.sh", "utf8");

    expect(dockerfile).toContain("FROM docker.1ms.run/library/node:20-bookworm-slim");
    expect(dockerfile).toContain("npm config set registry https://registry.npmmirror.com");
    expect(dockerfile).toContain("RUN npm run build");
    expect(dockerfile).toContain("CMD [\"npm\", \"run\", \"start\"]");
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("require_command docker");
    expect(script).toContain("git_in_dir()");
    expect(script).toContain("git_in_dir \"$GIT_ROOT\" pull --ff-only");
    expect(script).not.toContain("git -C");
    expect(script).toContain("docker build -t \"$IMAGE_NAME:$IMAGE_TAG\" -f \"$APP_ROOT/Dockerfile\" \"$APP_ROOT\"");
    expect(script).toContain("docker run -d");
    expect(script).toContain("--env-file \"$APP_ROOT/.env\"");
    expect(script).toContain("-v \"$APP_ROOT/data:/app/data\"");
    expect(script).toContain("trap rollback ERR");
    expect(script).toContain("docker rename \"$APP_NAME\" \"$BACKUP_CONTAINER\"");
    expect(script).toContain("check_health()");
    expect(script).toContain("curl -fsS \"$HEALTH_URL\"");
    expect(script).toContain("SYNC_DIST_TO_HOST");
    expect(script).toContain("sync_dist_to_host()");
    expect(script).toContain("cleanup_deploy_artifacts()");
    expect(script).toContain("rm -rf \"$APP_ROOT/dist.next\" \"$APP_ROOT/dist.previous\"");
    expect(script).toContain("docker cp \"$APP_NAME:/app/dist/.\" \"$next_dist/\"");
    expect(script).not.toContain("--retry-connrefused");
    expect(script).not.toContain("npm run build");
  });
});
