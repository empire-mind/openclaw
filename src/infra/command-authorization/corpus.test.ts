import { describe, expect, it } from "vitest";
import {
  createExecCommandAnalysisFromAuthorizationPlan,
  planCommandForAuthorization,
  renderAuthorizationShellCommand,
} from "./plan.js";

describe("command authorization planner corpus", () => {
  it("marks tokenized argv commands as reusable trust candidates", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "argv",
      argv: ["git", "status", "--short"],
    });

    expect(plan.kind).toBe("analyzable");
    if (plan.kind !== "analyzable") {
      throw new Error(`expected analyzable plan, got ${plan.kind}`);
    }
    expect(plan.dialect).toBe("argv");
    expect(plan.tree).toEqual({ kind: "unit", unitId: "unit-0" });
    expect(plan.units).toEqual([
      expect.objectContaining({
        id: "unit-0",
        argv: ["git", "status", "--short"],
        relationship: "simple",
        allowlistEligible: true,
        allowAlwaysEligible: true,
        promptOnlyReasons: [],
        blockReasons: [],
      }),
    ]);
  });

  it("marks simple POSIX commands as reusable trust candidates", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: "ls /tmp",
    });

    expect(plan.kind).toBe("analyzable");
    if (plan.kind !== "analyzable") {
      throw new Error(`expected analyzable plan, got ${plan.kind}`);
    }
    expect(plan.dialect).toBe("posix-shell");
    expect(plan.tree).toEqual({ kind: "unit", unitId: "unit-0" });
    expect(plan.units[0]).toEqual(
      expect.objectContaining({
        raw: "ls /tmp",
        argv: ["ls", "/tmp"],
        relationship: "simple",
        allowlistEligible: true,
        allowAlwaysEligible: true,
      }),
    );
  });

  it("preserves simple POSIX pipelines as reusable command trees", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: "ls /tmp | grep log",
    });

    expect(plan.kind).toBe("analyzable");
    if (plan.kind !== "analyzable") {
      throw new Error(`expected analyzable plan, got ${plan.kind}`);
    }
    expect(plan.tree).toEqual({
      kind: "pipeline",
      children: [
        { kind: "unit", unitId: "unit-0" },
        { kind: "unit", unitId: "unit-1" },
      ],
    });
    expect(plan.units.map((unit) => unit.argv)).toEqual([
      ["ls", "/tmp"],
      ["grep", "log"],
    ]);
    expect(plan.units.every((unit) => unit.relationship === "pipeline")).toBe(true);
    expect(plan.units.every((unit) => unit.allowAlwaysEligible)).toBe(true);
  });

  it("renders enforced POSIX commands from the planner tree", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: "env printf hi | wc -c",
    });
    const analysis = createExecCommandAnalysisFromAuthorizationPlan({ plan });
    expect(analysis?.ok).toBe(true);
    if (!analysis) {
      throw new Error("expected command analysis");
    }

    const rendered = renderAuthorizationShellCommand({
      plan,
      segments: analysis.segments,
      mode: "enforced",
    });

    expect(rendered.ok).toBe(true);
    expect(rendered.command).toMatch(/'(?:[^']*\/)?printf' 'hi' \| '(?:[^']*\/)?wc' '-c'/);
    expect(rendered.command).not.toContain("'env'");
  });

  it("renders only safe-bin POSIX segments literally from the planner tree", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: "rg foo src/*.ts | head -n 5 && echo ok",
    });
    const analysis = createExecCommandAnalysisFromAuthorizationPlan({ plan });
    expect(analysis?.ok).toBe(true);
    if (!analysis) {
      throw new Error("expected command analysis");
    }

    const rendered = renderAuthorizationShellCommand({
      plan,
      segments: analysis.segments,
      segmentSatisfiedBy: [null, "safeBins", null],
      mode: "safe-bins",
    });

    expect(rendered.ok).toBe(true);
    expect(rendered.command).toContain("rg foo src/*.ts");
    expect(rendered.command).toMatch(/'(?:[^']*\/)?head' '-n' '5'/);
  });

  it("fails closed when planner render segment metadata does not match", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: "echo ok",
    });
    const analysis = createExecCommandAnalysisFromAuthorizationPlan({ plan });
    expect(analysis?.ok).toBe(true);
    if (!analysis) {
      throw new Error("expected command analysis");
    }

    expect(
      renderAuthorizationShellCommand({
        plan,
        segments: analysis.segments,
        segmentSatisfiedBy: [],
        mode: "safe-bins",
      }),
    ).toEqual({ ok: false, reason: "segment metadata mismatch" });
  });

  it.each([
    {
      name: "and conditionals",
      command: "pnpm test && pnpm build",
      operators: ["&&"],
      relationships: ["simple", "and-conditional"],
    },
    {
      name: "or conditionals",
      command: "test -f package.json || echo missing",
      operators: ["||"],
      relationships: ["simple", "or-conditional"],
    },
    {
      name: "sequences",
      command: "echo one; echo two",
      operators: [";"],
      relationships: ["simple", "sequence"],
    },
  ])("preserves POSIX $name tree shape", async ({ command, operators, relationships }) => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command,
    });

    expect(plan.kind).toBe("analyzable");
    if (plan.kind !== "analyzable") {
      throw new Error(`expected analyzable plan, got ${plan.kind}`);
    }
    expect(plan.tree).toEqual({
      kind: "chain",
      operators,
      children: [
        { kind: "unit", unitId: "unit-0" },
        { kind: "unit", unitId: "unit-1" },
      ],
    });
    expect(plan.units.map((unit) => unit.relationship)).toEqual(relationships);
    expect(plan.units.every((unit) => unit.allowlistEligible)).toBe(true);
    expect(plan.units.every((unit) => unit.allowAlwaysEligible)).toBe(true);
  });

  it("plans POSIX shell wrapper payloads as reusable trust candidates", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: 'sh -c "echo wrapped"',
    });

    expect(plan.kind).toBe("analyzable");
    if (plan.kind !== "analyzable") {
      throw new Error(`expected analyzable plan, got ${plan.kind}`);
    }
    expect(plan.tree).toEqual({ kind: "unit", unitId: "unit-0" });
    expect(plan.units).toEqual([
      expect.objectContaining({
        id: "unit-0",
        raw: "echo wrapped",
        argv: ["echo", "wrapped"],
        relationship: "wrapper-inline",
        allowlistEligible: true,
        allowAlwaysEligible: true,
        promptOnlyReasons: [],
        blockReasons: [],
      }),
    ]);
  });

  it("keeps surrounding POSIX chain commands when planning shell wrapper payloads", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: "git status && sh -c 'npm test'",
    });

    expect(plan.kind).toBe("analyzable");
    if (plan.kind !== "analyzable") {
      throw new Error(`expected analyzable plan, got ${plan.kind}`);
    }
    expect(plan.tree).toEqual({
      kind: "chain",
      operators: ["&&"],
      children: [
        { kind: "unit", unitId: "unit-0" },
        { kind: "unit", unitId: "unit-1" },
      ],
    });
    expect(plan.units).toEqual([
      expect.objectContaining({
        id: "unit-0",
        raw: "git status",
        argv: ["git", "status"],
        relationship: "simple",
        allowAlwaysEligible: true,
      }),
      expect.objectContaining({
        id: "unit-1",
        raw: "npm test",
        argv: ["npm", "test"],
        relationship: "and-conditional",
        allowAlwaysEligible: true,
      }),
    ]);
  });

  it("makes interpreter inline eval prompt-only instead of reusable trust", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: "python -c 'print(\"hi\")'",
    });

    expect(plan.kind).toBe("prompt-only");
    if (plan.kind !== "prompt-only") {
      throw new Error(`expected prompt-only plan, got ${plan.kind}`);
    }
    expect(plan.promptOnlyReasons).toEqual(["interpreter-inline-eval"]);
    expect(plan.units).toEqual([
      expect.objectContaining({
        argv: ["python", "-c", 'print("hi")'],
        allowlistEligible: false,
        allowAlwaysEligible: false,
        promptOnlyReasons: ["interpreter-inline-eval"],
      }),
    ]);
  });

  it("makes shell line continuation prompt-only instead of reusable trust", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: "pnpm test \\\n --filter foo",
    });

    expect(plan.kind).toBe("prompt-only");
    if (plan.kind !== "prompt-only") {
      throw new Error(`expected prompt-only plan, got ${plan.kind}`);
    }
    expect(plan.promptOnlyReasons).toContain("unsupported-shell-syntax");
    expect(plan.units.every((unit) => !unit.allowAlwaysEligible)).toBe(true);
  });

  it("makes command substitution prompt-only and flags dynamic executables", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: "$(whoami) --help",
    });

    expect(plan.kind).toBe("prompt-only");
    if (plan.kind !== "prompt-only") {
      throw new Error(`expected prompt-only plan, got ${plan.kind}`);
    }
    expect(plan.promptOnlyReasons).toEqual(["command-substitution", "dynamic-executable"]);
    expect(plan.units[0]).toEqual(
      expect.objectContaining({
        argv: [],
        allowlistEligible: false,
        allowAlwaysEligible: false,
        promptOnlyReasons: ["command-substitution", "dynamic-executable"],
      }),
    );
  });

  it("marks malformed shell as unanalyzable", async () => {
    const plan = await planCommandForAuthorization({
      dialect: "posix-shell",
      command: "echo 'unterminated",
    });

    expect(plan).toEqual({
      kind: "unanalyzable",
      source: "echo 'unterminated",
      dialect: "posix-shell",
      reasons: ["malformed-shell"],
    });
  });

  it.each([
    {
      dialect: "powershell" as const,
      command: 'pwsh -Command "Get-ChildItem"',
      reason: "unsupported-powershell-wrapper",
    },
    {
      dialect: "windows-cmd" as const,
      command: "cmd /c dir",
      reason: "unsupported-cmd-wrapper",
    },
  ])("keeps $dialect commands prompt-only", async ({ dialect, command, reason }) => {
    const plan = await planCommandForAuthorization({ dialect, command });

    expect(plan.kind).toBe("prompt-only");
    if (plan.kind !== "prompt-only") {
      throw new Error(`expected prompt-only plan, got ${plan.kind}`);
    }
    expect(plan.dialect).toBe(dialect);
    expect(plan.promptOnlyReasons).toEqual([reason]);
    expect(plan.units[0]).toEqual(
      expect.objectContaining({
        relationship: "wrapper-inline",
        allowlistEligible: false,
        allowAlwaysEligible: false,
        promptOnlyReasons: [reason],
      }),
    );
  });
});
