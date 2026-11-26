// worker: runs one bossman task in a fresh Pyo sandbox and brings the commits back.
//
//   worker run --tier junior|senior|expert --task T3 --spec specs/T3.md [--test "bun test"]
//
// Which runners a tier tries, and in what order, comes from bossman.jsonc in the repo.

import { Sandbox } from "@pyodev/sandbox";
import { parseArgs } from "node:util";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseJsonc } from "./jsonc";

type Tier = "junior" | "senior" | "expert";
const TIERS: Tier[] = ["junior", "senior", "expert"];
type Runner =
  | { kind: "opencode"; model: string }
  | { kind: "claude"; account: "max" | "pro"; token: string };

const DEFAULT_TIERS: Record<Tier, string[]> = {
  junior: ["litellm/fast"],
  senior: ["litellm/balanced"],
  expert: ["claude:max", "litellm/premium"],
};
const TOKEN_VAR = { max: "BOSSMAN_CLAUDE_MAX_TOKEN", pro: "BOSSMAN_CLAUDE_PRO_TOKEN" } as const;

type Outcome = "done" | "failed" | "limit";

interface Report {
  task: string;
  tier: Tier;
  ran: string;
  outcome: Outcome;
  agentExit: number | null;
  tests: "pass" | "fail" | "none";
  commits: number;
  branch: string;
  log: string;
  note?: string;
}

const SIZE: Record<Tier, { cpus: number; memoryMib: number; diskMib: number }> = {
  junior: { cpus: 2, memoryMib: 4096, diskMib: 8192 },
  senior: { cpus: 2, memoryMib: 4096, diskMib: 8192 },
  expert: { cpus: 4, memoryMib: 8192, diskMib: 16384 },
};
const AGENT_TIMEOUT_MS = 45 * 60_000;
const TEST_TIMEOUT_MS = 15 * 60_000;
const LOCK_WAIT_MS = 10 * 60_000;
const MAX_UPLOAD = 64 * 1024 * 1024; // the SDK moves up to 64 MiB per call
// Not confirmed yet: the exact text claude -p prints at a plan's usage limit.
const LIMIT_RE = /usage limit|rate limit/i;
const PROMPT = `Do the task in the spec below. Work in the current directory, which is a git repository.
When you're done, run the spec's test command, then commit your work with git.

`;

function fail(msg: string): never {
  console.error(`worker: ${msg}`);
  process.exit(2);
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) fail(`${name} isn't set. See the README for the variables bossman needs.`);
  return v;
}

function git(args: string[], cwd: string): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });
  if (r.exitCode !== 0) fail(`git ${args[0]} failed: ${r.stderr.toString().trim()}`);
  return r.stdout.toString().trim();
}

function gitOk(args: string[], cwd: string): boolean {
  return Bun.spawnSync(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" }).exitCode === 0;
}

// One Claude task per account at a time, across every repo on this machine.
async function lock(account: string): Promise<(() => void) | null> {
  const dir = join(homedir(), ".bossman", "locks");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `claude-${account}.lock`);
  const until = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < until) {
    try {
      const fd = openSync(path, "wx");
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return () => unlinkSync(path);
    } catch {
      const pid = Number(readFileSync(path, "utf8"));
      try {
        process.kill(pid, 0);
      } catch {
        unlinkSync(path); // its owner is gone
        continue;
      }
      await Bun.sleep(5000);
    }
  }
  return null;
}

function readJsonc(path: string): unknown {
  try {
    return parseJsonc(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`couldn't read ${path}: ${(e as Error).message}`);
  }
}

// The litellm provider block from the repo's opencode.jsonc. Sandboxes get the same aliases.
interface LitellmProvider {
  settings?: { baseURL?: string };
  models?: Record<string, unknown>;
  [k: string]: unknown;
}

function litellmProvider(root: string): LitellmProvider {
  const path = ["opencode.jsonc", "opencode.json"].map((f) => join(root, f)).find(existsSync);
  if (!path) fail("this repo has no opencode.jsonc. Run bossman init first.");
  const cfg = readJsonc(path) as { providers?: { litellm?: LitellmProvider } };
  const p = cfg.providers?.litellm;
  if (!p?.models) fail(`${path} has no providers.litellm with models. See the template from bossman init.`);
  return p;
}

// Tiers from bossman.jsonc, or the defaults when the repo has none.
function tierRunners(root: string, tier: Tier, aliases: string[]): Runner[] {
  const path = join(root, "bossman.jsonc");
  let names = DEFAULT_TIERS[tier];
  if (existsSync(path)) {
    const cfg = readJsonc(path) as { tiers?: Partial<Record<Tier, unknown>> };
    const list = cfg.tiers?.[tier];
    if (list !== undefined) {
      if (!Array.isArray(list) || list.length === 0 || !list.every((s) => typeof s === "string")) {
        fail(`tiers.${tier} in bossman.jsonc must be a list of runners, like ["litellm/fast"].`);
      }
      names = list as string[];
    }
  }

  const out: Runner[] = [];
  for (const name of names) {
    const claude = /^claude:(max|pro)$/.exec(name);
    if (claude) {
      const account = claude[1] as "max" | "pro";
      const token = process.env[TOKEN_VAR[account]];
      if (token) out.push({ kind: "claude", account, token });
      continue; // a plan without a token is skipped
    }
    const litellm = /^litellm\/(.+)$/.exec(name);
    if (litellm) {
      if (!aliases.includes(litellm[1])) {
        fail(`bossman.jsonc uses ${name}, but opencode.jsonc has no LiteLLM alias "${litellm[1]}".`);
      }
      out.push({ kind: "opencode", model: name });
      continue;
    }
    fail(`bossman.jsonc has an unknown runner "${name}". Use litellm/<alias>, claude:max or claude:pro.`);
  }
  if (out.length === 0) {
    fail(`no runner for ${tier} can run. Set ${TOKEN_VAR.max}, or add a litellm/<alias> to tiers.${tier}.`);
  }
  return out;
}

function label(r: Runner): string {
  return r.kind === "claude" ? `claude-${r.account}` : r.model;
}

function opencodeConfig(provider: LitellmProvider): string {
  const base = need("LITELLM_BASE_URL").replace(/\/+$/, "");
  const baseURL = (provider.settings?.baseURL ?? "${LITELLM_BASE_URL}/v1").replaceAll("${LITELLM_BASE_URL}", base);
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      providers: { litellm: { ...provider, settings: { ...provider.settings, baseURL } } },
      // Searches go to the cheap alias when there is one. Otherwise explore uses the task's model.
      ...(provider.models && "fast" in provider.models ? { agents: { explore: { model: "litellm/fast" } } } : {}),
    },
    null,
    2,
  );
}

interface Job {
  task: string;
  tier: Tier;
  branch: string;
  worktree: string;
  bundle: string;
  spec: string;
  test?: string;
  logPath: string;
  patchDir: string;
  provider: LitellmProvider;
}

async function runOnce(job: Job, runner: Runner): Promise<Report> {
  const log = (line: string) => appendFileSync(job.logPath, line.endsWith("\n") ? line : line + "\n");
  const report: Report = {
    task: job.task,
    tier: job.tier,
    ran: label(runner),
    outcome: "failed",
    agentExit: null,
    tests: "none",
    commits: 0,
    branch: job.branch,
    log: job.logPath,
  };

  const env: Record<string, string> =
    runner.kind === "claude"
      ? // Only the plan token. ANTHROPIC_API_KEY would replace the plan login.
        { CLAUDE_CODE_OAUTH_TOKEN: runner.token, IS_SANDBOX: "1" }
      : { LITELLM_API_KEY: need("LITELLM_API_KEY"), OPENCODE_DISABLE_FREE_MODELS: "1" };

  const headBefore = git(["rev-parse", job.branch], job.worktree);
  log(`== ${new Date().toISOString()} ${job.task} on ${label(runner)} from ${headBefore}`);

  const sbx = await Sandbox.create({
    template: "base",
    ttl: "2h",
    ...SIZE[job.tier],
    env,
    labels: { app: "bossman", task: job.task, tier: job.tier },
  });
  log(`sandbox ${sbx.id}`);

  try {
    await sbx.files.write("/root/task.bundle", readFileSync(job.bundle));
    await sbx.files.write("/root/prompt.md", PROMPT + job.spec);
    const setup = await sbx.exec(
      `git clone -q -b ${job.branch} /root/task.bundle /root/repo && cd /root/repo && ` +
        `git config user.name bossman && git config user.email bossman@localhost`,
      { timeoutMs: 120_000 },
    );
    if (setup.exitCode !== 0) {
      report.note = `couldn't unpack the repo in the sandbox: ${setup.stderr.trim().slice(-300)}`;
      return report;
    }

    let cmd: string;
    if (runner.kind === "claude") {
      cmd = `cd /root/repo && claude -p --output-format json --permission-mode bypassPermissions < /root/prompt.md`;
    } else {
      await sbx.exec("mkdir -p /root/.config/opencode");
      await sbx.files.write("/root/.config/opencode/opencode.jsonc", opencodeConfig(job.provider));
      cmd =
        `cd /root/repo && opencode run --standalone --auto --format json --model ${runner.model} ` +
        `--file /root/prompt.md "Do the task in the attached file."`;
    }

    let tail = "";
    const keep = (s: string) => {
      log(s);
      tail = (tail + s).slice(-65_536);
    };
    const agent = await sbx.exec(cmd, { timeoutMs: AGENT_TIMEOUT_MS, onStdout: keep, onStderr: keep });
    report.agentExit = agent.exitCode;
    if (agent.timedOut) report.note = "the agent ran past its time limit and was stopped";

    if (runner.kind === "claude" && agent.exitCode !== 0 && LIMIT_RE.test(tail)) {
      report.outcome = "limit";
      report.note = `${label(runner)} is at its usage limit`;
      return report;
    }

    await sbx.exec(
      `cd /root/repo && git add -A && (git diff --cached --quiet || git commit -q -m "${job.task}: uncommitted changes")`,
    );

    if (job.test) {
      const t = await sbx.exec(`cd /root/repo && ${job.test}`, {
        timeoutMs: TEST_TIMEOUT_MS,
        onStdout: log,
        onStderr: log,
      });
      report.tests = t.exitCode === 0 ? "pass" : "fail";
    }

    const count = await sbx.exec(`cd /root/repo && git rev-list --count ${headBefore}..HEAD`);
    report.commits = Number(count.stdout.trim()) || 0;
    if (report.commits > 0) {
      await sbx.exec(`cd /root/repo && git format-patch -q --stdout ${headBefore}..HEAD > /root/out.patch`);
      const patch = join(job.patchDir, `${job.task}-${Date.now()}.patch`);
      writeFileSync(patch, await sbx.files.readBytes("/root/out.patch"));
      if (!gitOk(["am", "-q", "--3way", patch], job.worktree)) {
        gitOk(["am", "--abort"], job.worktree);
        report.note = `the commits didn't apply to ${job.branch}. The patch is at ${patch}`;
        return report;
      }
    }

    const agentOk = agent.exitCode === 0 && !agent.timedOut;
    report.outcome = agentOk && report.commits > 0 && report.tests !== "fail" ? "done" : "failed";
    if (report.commits === 0 && !report.note) report.note = "the agent made no changes";
    return report;
  } finally {
    await sbx.delete().catch((e) => log(`couldn't delete sandbox ${sbx.id}: ${e}`));
  }
}

async function run(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      tier: { type: "string" },
      task: { type: "string" },
      spec: { type: "string" },
      test: { type: "string" },
      base: { type: "string", default: "HEAD" },
    },
  });
  const tier = values.tier as Tier;
  if (!TIERS.includes(tier)) fail("--tier must be junior, senior or expert.");
  const task = values.task ?? fail("--task is missing, like --task T3.");
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(task)) fail("--task may only have letters, digits, dashes and underscores.");
  const specPath = values.spec ?? fail("--spec is missing, like --spec specs/T3.md.");
  need("PYO_URL");
  need("PYO_API_KEY");

  const root = git(["rev-parse", "--show-toplevel"], process.cwd());
  const provider = litellmProvider(root);
  const list = tierRunners(root, tier, Object.keys(provider.models!));
  const state = join(root, ".bossman");
  for (const d of ["worktrees", "logs", "bundles", "patches"]) mkdirSync(join(state, d), { recursive: true });

  const branch = `task/${task}`;
  const worktree = join(state, "worktrees", task);
  if (!gitOk(["rev-parse", "--verify", "--quiet", branch], root)) {
    git(["worktree", "add", "-q", "-b", branch, worktree, values.base!], root);
  } else if (!gitOk(["-C", worktree, "rev-parse"], root)) {
    git(["worktree", "add", "-q", worktree, branch], root);
  }

  const bundle = join(state, "bundles", `${task}.bundle`);
  git(["bundle", "create", "-q", bundle, branch], root);
  if (statSync(bundle).size > MAX_UPLOAD) {
    fail(`the repo is over 64 MiB as a git bundle, which is more than a sandbox upload takes.`);
  }

  const job: Job = {
    task,
    tier,
    branch,
    worktree,
    bundle,
    spec: readFileSync(resolve(root, specPath), "utf8"),
    test: values.test,
    logPath: join(state, "logs", `${task}.log`),
    patchDir: join(state, "patches"),
    provider,
  };

  let report: Report | undefined;
  for (const r of list) {
    let release: (() => void) | null = () => {};
    if (r.kind === "claude") {
      release = await lock(r.account);
      if (!release) continue; // busy for too long, try the next one
    }
    try {
      report = await runOnce(job, r);
    } finally {
      release();
    }
    if (report.outcome !== "limit") break;
  }

  if (!report) fail("no runner was free. Try again later.");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.outcome === "done" ? 0 : 1);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "run") {
  await run(rest).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`couldn't run the task: ${msg}. Check PYO_URL, PYO_API_KEY and that a sandbox server is up.`);
  });
} else fail(`unknown command "${cmd ?? ""}". Use: worker run --tier <tier> --task <id> --spec <path> [--test <cmd>]`);
