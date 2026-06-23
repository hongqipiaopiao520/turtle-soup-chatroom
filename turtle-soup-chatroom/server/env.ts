import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const equalsAt = trimmed.indexOf("=");
  if (equalsAt === -1) return null;

  const key = trimmed.slice(0, equalsAt).trim();
  const rawValue = trimmed.slice(equalsAt + 1).trim();
  const value = rawValue.replace(/^['"]|['"]$/g, "");

  return key ? { key, value } : null;
}

export function loadLocalEnv(cwd = process.cwd()) {
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed && process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}
