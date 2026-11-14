import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Repository onboarding.
 *
 * The hardest adoption moment for UNTIL is the first one: a CTO has to describe
 * a business outcome and author acceptance checks in a custom DSL before seeing
 * anything happen. This module removes that step — it inspects a real repository,
 * detects how the project proves itself, and generates a ready-to-run goal plus
 * the matching command profile.
 *
 * Detection is deliberately conservative: it reports what it found and refuses to
 * invent a check that would pass trivially.
 */

const NODE = process.execPath;

async function exists(root, relative) {
  try {
    await stat(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(root, relative) {
  try {
    return JSON.parse(await readFile(path.join(root, relative), "utf8"));
  } catch {
    return null;
  }
}

async function readText(root, relative) {
  try {
    return await readFile(path.join(root, relative), "utf8");
  } catch {
    return null;
  }
}

/**
 * Extracts the argument vector of a plain `node ...` script invocation.
 *
 * Only a script the shell would pass through unchanged is accepted: no pipes, no
 * `&&`, no variables, no quotes, no redirection. Anything else returns null and
 * the caller falls back to the package manager, which owns the real script.
 */
export function parseNodeInvocation(script) {
  const trimmed = String(script ?? "").trim();
  if (!/^node\s+/.test(trimmed)) return null;
  // Globs are fine: node expands `test/*.test.mjs` itself. Everything the shell
  // would interpret — pipes, chains, variables, quotes, redirection — is not.
  if (/[|&;<>$`'"\\(){}!~\n]/.test(trimmed.slice('node'.length))) return null;
  const args = trimmed.split(/\s+/).slice(1).filter(Boolean);
  return args.length ? args : null;
}

export async function detectProject(root) {
  const absolute = path.resolve(root);
  const evidence = [];
  const packageJson = await readJsonFile(absolute, "package.json");
  if (packageJson) {
    const test = packageJson.scripts?.test;
    evidence.push("package.json");
    if (typeof test === "string" && test.trim()) {
      const direct = parseNodeInvocation(test);
      if (direct) {
        return {
          language: "javascript",
          runtime: "node",
          testCommand: NODE,
          testArgs: direct,
          label: `node ${direct.join(" ")}`,
          confidence: "high",
          evidence,
          name: packageJson.name ?? path.basename(absolute),
        };
      }
      // Anything the shell would interpret (pipes, &&, variables, quotes) goes
      // through the package manager instead, so the project's own script decides.
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      return {
        language: "javascript",
        runtime: "node",
        testCommand: npm,
        testArgs: ["test"],
        label: "npm test",
        confidence: "medium",
        evidence,
        note: "Runs the project's own test script. Review the script before trusting it as an acceptance gate.",
        name: packageJson.name ?? path.basename(absolute),
      };
    }
  }

  if (await exists(absolute, "pyproject.toml") || await exists(absolute, "setup.py") || await exists(absolute, "requirements.txt")) {
    evidence.push("python project");
    return {
      language: "python",
      runtime: "python",
      testCommand: process.platform === "win32" ? "python" : "python3",
      testArgs: ["-m", "pytest"],
      label: "python -m pytest",
      confidence: "medium",
      evidence,
      note: "Requires pytest to be installed in the environment that runs the check.",
      name: path.basename(absolute),
    };
  }

  if (await exists(absolute, "Cargo.toml")) {
    evidence.push("Cargo.toml");
    return {
      language: "rust", runtime: "cargo", testCommand: "cargo", testArgs: ["test"],
      label: "cargo test", confidence: "high", evidence, name: path.basename(absolute),
    };
  }

  if (await exists(absolute, "go.mod")) {
    evidence.push("go.mod");
    return {
      language: "go", runtime: "go", testCommand: "go", testArgs: ["test", "./..."],
      label: "go test ./...", confidence: "high", evidence, name: path.basename(absolute),
    };
  }

  if (await exists(absolute, "pom.xml")) {
    evidence.push("pom.xml");
    return {
      language: "java", runtime: "maven", testCommand: "mvn", testArgs: ["test"],
      label: "mvn test", confidence: "medium", evidence, name: path.basename(absolute),
    };
  }

  if (await exists(absolute, "build.gradle") || await exists(absolute, "build.gradle.kts")) {
    evidence.push("gradle build");
    return {
      language: "java", runtime: "gradle", testCommand: "gradle", testArgs: ["test"],
      label: "gradle test", confidence: "medium", evidence, name: path.basename(absolute),
    };
  }

  const makefile = await readText(absolute, "Makefile");
  if (makefile && /(^|\n)test\s*:/.test(makefile)) {
    evidence.push("Makefile");
    return {
      language: "make", runtime: "make", testCommand: "make", testArgs: ["test"],
      label: "make test", confidence: "medium", evidence, name: path.basename(absolute),
    };
  }

  return {
    language: "unknown",
    runtime: "unknown",
    testCommand: null,
    testArgs: [],
    label: null,
    confidence: "none",
    evidence,
    name: path.basename(absolute),
  };
}

/**
 * Builds a goal file and the matching `until.config.json` fragment for a detected
 * project. The acceptance gate is the project's own test command — the same command
 * a developer runs to decide whether a change is real.
 */
export function buildGoalTemplate(project, {
  id = null,
  title = null,
  outcome = null,
  baseline = null,
  target = null,
  unit = null,
  testProfile = "repoTest",
  maxAttempts = 3,
} = {}) {
  if (!project.testCommand) {
    throw new Error("No test command was detected; author goal.policy.acceptance by hand");
  }
  const goalId = id ?? `goal_${String(project.name).replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() || "project"}`;
  const goal = {
    id: goalId,
    title: title ?? `Autonomously improve ${project.name}`,
    outcome: outcome ?? "Describe the business outcome this repository is supposed to produce",
    baseline,
    target,
    unit,
    policy: {
      acceptance: [
        { type: "command_profile", profile: testProfile, expect: { exitCode: 0 } },
      ],
      build: {
        testProfile,
        maxAttempts,
      },
    },
  };
  const config = {
    checks: {
      [testProfile]: {
        command: project.testCommand,
        args: project.testArgs,
        timeoutMs: 120_000,
      },
    },
  };
  const notes = [
    `Detected ${project.label} with ${project.confidence} confidence.`,
    project.note ?? null,
    "The acceptance gate is the project's own test command: the builder must make it pass.",
    "Add goal.policy.releasePaths to declare which files may be packaged into a release candidate.",
    "Set goal.policy.build.allowedPaths to restrict which files the builder may change.",
    "Without goal.policy.acceptance a live model contract stops fail-closed — this file supplies it.",
  ].filter(Boolean);
  return { goal, config, notes };
}
