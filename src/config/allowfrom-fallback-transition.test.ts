import { describe, expect, it } from "vitest";
import type { PluginManifestRecord } from "../plugins/manifest-registry.js";
import {
  applyAllowFromFallbackTransition,
  classifyAllowFromFallbackTransitions,
} from "./allowfrom-fallback-transition.js";
import type { OpenClawConfig } from "./types.openclaw.js";

const fallbackOffCapabilities = {
  groupAllowFromFallbackToAllowFrom: false,
  legacyDmAllowFromMigrationTarget: "groupAllowFrom" as const,
  commandGroupAllowFromFallbackToAllowFrom: false,
  legacyDmCommandGroupAllowFromMigrationTarget: "commandGroupAllowFrom" as const,
  groupOwnerAllowFromFallbackToAllowFrom: false,
  legacyDmGroupOwnerAllowFromMigrationTarget: "groupOwnerAllowFrom" as const,
  commandAllowFromFallbackToAllowFrom: false,
  legacyDmCommandAllowFromMigrationTarget: "commands.allowFrom" as const,
  elevatedAllowFromFallbackToAllowFrom: false,
  legacyDmElevatedAllowFromMigrationTarget: "tools.elevated.allowFrom" as const,
};

const resolveCapabilities = (channelId: string) =>
  channelId === "demo" ? fallbackOffCapabilities : undefined;

describe("allowFrom fallback transition", () => {
  it("copies wildcard, pattern, and accessGroup entries to each explicit target", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["*", "foo:*", "accessGroup:ops", "", "foo:*"],
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, { resolveCapabilities });

    expect(result.config.channels?.demo).toMatchObject({
      groupAllowFrom: ["*", "foo:*", "accessGroup:ops"],
      commandGroupAllowFrom: ["*", "foo:*", "accessGroup:ops"],
      groupOwnerAllowFrom: ["*", "foo:*", "accessGroup:ops"],
    });
    expect(result.config.commands?.allowFrom?.demo).toEqual(["*", "foo:*", "accessGroup:ops"]);
    expect(result.config.tools?.elevated?.allowFrom?.demo).toEqual([
      "*",
      "foo:*",
      "accessGroup:ops",
    ]);
    expect(result.config.channels?.demo).not.toBe(cfg.channels?.demo);
    expect(result.changes).toHaveLength(5);
  });

  it("does not overwrite explicit targets, including empty arrays", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["user:1"],
          groupAllowFrom: ["group:1"],
          commandGroupAllowFrom: ["cmd:1"],
          groupOwnerAllowFrom: [],
        },
      },
      commands: { allowFrom: { demo: [] } },
      tools: { elevated: { allowFrom: { demo: ["root:1"] } } },
    };

    const result = applyAllowFromFallbackTransition(cfg, { resolveCapabilities });

    expect(result.config).toBe(cfg);
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("copies allowFrom over empty groupAllowFrom because runtime treats it as fallback", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["user:1"],
          groupAllowFrom: [],
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              groupAllowFromFallbackToAllowFrom: false,
              legacyDmAllowFromMigrationTarget: "groupAllowFrom",
            }
          : undefined,
    });

    expect(result.config.channels?.demo).toMatchObject({
      allowFrom: ["user:1"],
      groupAllowFrom: ["user:1"],
    });
    expect(result.changes).toEqual([
      "Copied channels.demo.allowFrom entries to channels.demo.groupAllowFrom because group-sender fallback to allowFrom is disabled.",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("copies account allowFrom over inherited empty groupAllowFrom", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          groupAllowFrom: [],
          accounts: {
            work: {
              allowFrom: ["account-user"],
            },
          },
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              groupAllowFromFallbackToAllowFrom: false,
              legacyDmAllowFromMigrationTarget: "groupAllowFrom",
            }
          : undefined,
    });

    const demo = result.config.channels?.demo as
      | { accounts?: Record<string, Record<string, unknown>> }
      | undefined;
    expect(demo?.accounts?.work).toMatchObject({
      allowFrom: ["account-user"],
      groupAllowFrom: ["account-user"],
    });
    expect(result.changes).toEqual([
      "Copied channels.demo.accounts.work.allowFrom entries to channels.demo.accounts.work.groupAllowFrom because group-sender fallback to allowFrom is disabled.",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("copies allowFrom into commandGroupAllowFrom when groupAllowFrom is empty", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["cmd-user"],
          groupAllowFrom: [],
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              commandGroupAllowFromFallbackToAllowFrom: false,
              legacyDmCommandGroupAllowFromMigrationTarget: "commandGroupAllowFrom",
            }
          : undefined,
    });

    expect(result.config.channels?.demo).toMatchObject({
      allowFrom: ["cmd-user"],
      groupAllowFrom: [],
      commandGroupAllowFrom: ["cmd-user"],
    });
    expect(result.changes).toEqual([
      "Copied channels.demo.allowFrom entries to channels.demo.commandGroupAllowFrom because command-group fallback to allowFrom is disabled.",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("copies allowFrom into groupSenderAllowFrom even when groupAllowFrom exists", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["sender:1"],
          groupAllowFrom: ["room:1"],
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              groupAllowFromFallbackToAllowFrom: false,
              legacyDmAllowFromMigrationTarget: "groupSenderAllowFrom",
            }
          : undefined,
    });

    expect(result.config.channels?.demo).toMatchObject({
      allowFrom: ["sender:1"],
      groupAllowFrom: ["room:1"],
      groupSenderAllowFrom: ["sender:1"],
    });
    expect(result.changes).toEqual([
      "Copied channels.demo.allowFrom entries to channels.demo.groupSenderAllowFrom because group-sender fallback to allowFrom is disabled.",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("preserves dotted account ids when applying local account migrations", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          accounts: {
            "work.prod": {
              allowFrom: ["account-user"],
            },
          },
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              groupAllowFromFallbackToAllowFrom: false,
              legacyDmAllowFromMigrationTarget: "groupAllowFrom",
            }
          : undefined,
    });

    const demo = result.config.channels?.demo as
      | { accounts?: Record<string, Record<string, unknown>>; work?: unknown }
      | undefined;
    expect(demo?.accounts?.["work.prod"]).toMatchObject({
      allowFrom: ["account-user"],
      groupAllowFrom: ["account-user"],
    });
    expect(demo?.work).toBeUndefined();
    expect(result.changes).toEqual([
      "Copied channels.demo.accounts.work.prod.allowFrom entries to channels.demo.accounts.work.prod.groupAllowFrom because group-sender fallback to allowFrom is disabled.",
    ]);
  });

  it("does not copy inherited channel allowFrom into account-local targets", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["channel-user"],
          accounts: {
            work: {
              name: "Work",
            },
          },
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              groupAllowFromFallbackToAllowFrom: false,
              legacyDmAllowFromMigrationTarget: "groupAllowFrom",
            }
          : undefined,
    });

    expect(result.config.channels?.demo).toMatchObject({
      allowFrom: ["channel-user"],
      groupAllowFrom: ["channel-user"],
      accounts: {
        work: {
          name: "Work",
        },
      },
    });
    expect(
      (
        result.config.channels?.demo as
          | { accounts?: { work?: { groupAllowFrom?: unknown } } }
          | undefined
      )?.accounts?.work?.groupAllowFrom,
    ).toBeUndefined();
    expect(result.changes).toEqual([
      "Copied channels.demo.allowFrom entries to channels.demo.groupAllowFrom because group-sender fallback to allowFrom is disabled.",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("preserves explicit empty account allowlists when parent targets are migrated", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["channel-user"],
          accounts: {
            blocked: {
              allowFrom: [],
            },
          },
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, { resolveCapabilities });
    const demo = result.config.channels?.demo as
      | { accounts?: Record<string, Record<string, unknown>> }
      | undefined;

    expect(result.config.channels?.demo).toMatchObject({
      allowFrom: ["channel-user"],
      groupAllowFrom: ["channel-user"],
      commandGroupAllowFrom: ["channel-user"],
      groupOwnerAllowFrom: ["channel-user"],
    });
    expect(demo?.accounts?.blocked).toMatchObject({
      allowFrom: [],
      groupAllowFrom: [],
      commandGroupAllowFrom: [],
      groupOwnerAllowFrom: [],
    });
    expect(result.changes).toEqual([
      "Copied channels.demo.allowFrom entries to channels.demo.groupAllowFrom because group-sender fallback to allowFrom is disabled.",
      "Copied channels.demo.allowFrom entries to channels.demo.commandGroupAllowFrom because command-group fallback to allowFrom is disabled.",
      "Copied channels.demo.allowFrom entries to channels.demo.groupOwnerAllowFrom because group-command-owner fallback to allowFrom is disabled.",
      "Set channels.demo.accounts.blocked.groupAllowFrom to an explicit empty allowlist because group-sender fallback to allowFrom is disabled.",
      "Set channels.demo.accounts.blocked.commandGroupAllowFrom to an explicit empty allowlist because command-group fallback to allowFrom is disabled.",
      "Set channels.demo.accounts.blocked.groupOwnerAllowFrom to an explicit empty allowlist because group-command-owner fallback to allowFrom is disabled.",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("does not migrate command group allowlists when groupAllowFrom already supplies them", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["dm-user"],
          groupAllowFrom: ["group-user"],
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              commandGroupAllowFromFallbackToAllowFrom: false,
              legacyDmCommandGroupAllowFromMigrationTarget: "commandGroupAllowFrom",
            }
          : undefined,
    });

    expect(result.config).toBe(cfg);
    expect(result.config.channels?.demo).toEqual({
      allowFrom: ["dm-user"],
      groupAllowFrom: ["group-user"],
    });
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("does not warn for targetless command group fallback when groupAllowFrom already supplies it", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["dm-user"],
          groupAllowFrom: ["group-user"],
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              commandGroupAllowFromFallbackToAllowFrom: false,
            }
          : undefined,
    });

    expect(result.config).toBe(cfg);
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("does not warn for targetless fallback when explicit runtime allowlists already exist", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["dm-user"],
          groupAllowFrom: [],
          commandGroupAllowFrom: [],
          groupOwnerAllowFrom: [],
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              groupAllowFromFallbackToAllowFrom: false,
              commandGroupAllowFromFallbackToAllowFrom: false,
              groupOwnerAllowFromFallbackToAllowFrom: false,
            }
          : undefined,
    });

    expect(result.config).toBe(cfg);
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("does not warn for targetless command group fallback after migrating groupAllowFrom", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["dm-user"],
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              groupAllowFromFallbackToAllowFrom: false,
              legacyDmAllowFromMigrationTarget: "groupAllowFrom",
              commandGroupAllowFromFallbackToAllowFrom: false,
            }
          : undefined,
    });

    expect(result.config.channels?.demo).toMatchObject({
      allowFrom: ["dm-user"],
      groupAllowFrom: ["dm-user"],
    });
    expect(result.changes).toEqual([
      "Copied channels.demo.allowFrom entries to channels.demo.groupAllowFrom because group-sender fallback to allowFrom is disabled.",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("classifies disabled or targetless families without mutating", () => {
    const cfg: OpenClawConfig = {
      plugins: { enabled: true, entries: { disabled: { enabled: false } } },
      channels: {
        demo: { allowFrom: ["user:1"] },
        missing: { allowFrom: ["user:2"] },
        disabled: { allowFrom: ["user:3"] },
      },
    };

    const classifications = classifyAllowFromFallbackTransitions(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              groupAllowFromFallbackToAllowFrom: false,
            }
          : undefined,
    });

    expect(classifications).toContainEqual(
      expect.objectContaining({
        channelName: "demo",
        family: "group-sender",
        fallbackDisabled: true,
        migrationEligible: false,
        warningNeeded: false,
        noMutationReason: "missing_target",
      }),
    );
    expect(classifications.some((item) => item.channelName === "disabled")).toBe(false);
  });

  it("stays quiet for targetless already-disabled fallback metadata", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: { allowFrom: ["user:1"] },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              groupOwnerAllowFromFallbackToAllowFrom: false,
            }
          : undefined,
    });

    expect(result.config).toBe(cfg);
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("ignores invalid manifest migration targets before writing config keys", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: { allowFrom: ["user:1"] },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? ({
              groupAllowFromFallbackToAllowFrom: false,
              legacyDmAllowFromMigrationTarget: "__proto__",
            } as unknown as ReturnType<typeof resolveCapabilities>)
          : undefined,
    });

    expect(result.config).toBe(cfg);
    expect(result.config.channels?.demo).toEqual({ allowFrom: ["user:1"] });
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("uses read-only manifest doctor metadata for repair transitions", () => {
    const cfg: OpenClawConfig = {
      channels: {
        external: { allowFrom: ["user:1"] },
      },
    };
    const result = applyAllowFromFallbackTransition(cfg, {
      manifestRegistry: {
        plugins: [
          {
            channelCatalogMeta: {
              id: "external",
              doctorCapabilities: {
                groupAllowFromFallbackToAllowFrom: false,
                legacyDmAllowFromMigrationTarget: "groupSenderAllowFrom",
              },
            },
          } as unknown as PluginManifestRecord,
        ],
      },
    });

    expect(result.config.channels?.external).toMatchObject({
      groupSenderAllowFrom: ["user:1"],
    });
  });

  it("skips manifest-owned transitions when the owning plugin is disabled", () => {
    const cfg: OpenClawConfig = {
      plugins: {
        entries: {
          "external-chat-plugin": { enabled: false },
        },
      },
      channels: {
        "external-chat": { allowFrom: ["user:1"] },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      manifestRegistry: {
        plugins: [
          {
            id: "external-chat-plugin",
            channelCatalogMeta: {
              id: "external-chat",
              doctorCapabilities: {
                groupAllowFromFallbackToAllowFrom: false,
                legacyDmAllowFromMigrationTarget: "groupAllowFrom",
              },
            },
          } as unknown as PluginManifestRecord,
        ],
      },
    });

    expect(result.config).toBe(cfg);
    expect(result.config.channels?.["external-chat"]).toEqual({ allowFrom: ["user:1"] });
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("copies inherited multi-account command fallback allowFrom entries into provider command allowlist", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["channel-user", "foo:*"],
          accounts: {
            work: {
              name: "Work",
            },
            personal: {
              name: "Personal",
            },
            disabled: {
              enabled: false,
              allowFrom: ["disabled-user"],
            },
          },
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              commandAllowFromFallbackToAllowFrom: false,
              legacyDmCommandAllowFromMigrationTarget: "commands.allowFrom",
            }
          : undefined,
    });

    expect(result.config.commands?.allowFrom?.demo).toEqual(["channel-user", "foo:*"]);
  });

  it("does not overwrite explicit provider command allowlist when accounts need migration", () => {
    const cfg: OpenClawConfig = {
      commands: { allowFrom: { demo: ["explicit-user"] } },
      channels: {
        demo: {
          accounts: {
            work: { allowFrom: ["account-user"] },
          },
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              commandAllowFromFallbackToAllowFrom: false,
              legacyDmCommandAllowFromMigrationTarget: "commands.allowFrom",
            }
          : undefined,
    });

    expect(result.config).toBe(cfg);
    expect(result.config.commands?.allowFrom?.demo).toEqual(["explicit-user"]);
    expect(result.changes).toEqual([]);
  });

  it("honors global command allowlist before migrating provider command allowlist", () => {
    const cfg: OpenClawConfig = {
      commands: { allowFrom: { "*": ["global-user"] } },
      channels: {
        demo: {
          allowFrom: ["channel-user"],
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              commandAllowFromFallbackToAllowFrom: false,
              legacyDmCommandAllowFromMigrationTarget: "commands.allowFrom",
            }
          : undefined,
    });

    expect(result.config).toBe(cfg);
    expect(result.config.commands?.allowFrom?.["*"]).toEqual(["global-user"]);
    expect(result.config.commands?.allowFrom?.demo).toBeUndefined();
    expect(result.changes).toEqual([]);
  });

  it("warns instead of unioning multi-account command fallback allowFrom entries", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["channel-user", "foo:*"],
          accounts: {
            work: {
              allowFrom: ["work-user"],
            },
            personal: {
              dm: { allowFrom: ["personal-user"] },
            },
          },
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              commandAllowFromFallbackToAllowFrom: false,
              legacyDmCommandAllowFromMigrationTarget: "commands.allowFrom",
            }
          : undefined,
    });

    expect(result.config).toBe(cfg);
    expect(result.config.commands?.allowFrom?.demo).toBeUndefined();
    expect(result.changes).toEqual([]);
    expect(result.warnings.join("\n")).toContain("account_scoped_entries");
  });

  it("copies single-account command fallback allowFrom entries into provider command allowlist", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          allowFrom: ["channel-user"],
          accounts: {
            work: {
              allowFrom: ["account-user"],
            },
          },
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              commandAllowFromFallbackToAllowFrom: false,
              legacyDmCommandAllowFromMigrationTarget: "commands.allowFrom",
            }
          : undefined,
    });

    expect(result.config.commands?.allowFrom?.demo).toEqual(["account-user"]);
  });

  it("warns instead of unioning multi-account elevated fallback allowFrom entries", () => {
    const cfg: OpenClawConfig = {
      channels: {
        demo: {
          dm: { allowFrom: ["channel-dm", "accessGroup:ops"] },
          accounts: {
            work: {
              allowFrom: ["account-user", "foo:*", "channel-dm"],
            },
            personal: {
              dm: { allowFrom: ["*", "accessGroup:oncall"] },
            },
            disabled: {
              enabled: false,
              allowFrom: ["disabled-user"],
            },
          },
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              dmAllowFromMode: "topOrNested",
              elevatedAllowFromFallbackToAllowFrom: false,
              legacyDmElevatedAllowFromMigrationTarget: "tools.elevated.allowFrom",
            }
          : undefined,
    });

    expect(result.config).toBe(cfg);
    expect(result.config.tools?.elevated?.allowFrom?.demo).toBeUndefined();
    expect(result.changes).toEqual([]);
    expect(result.warnings.join("\n")).toContain("account_scoped_entries");
  });

  it("does not overwrite explicit provider elevated allowlist when accounts need migration", () => {
    const cfg: OpenClawConfig = {
      tools: { elevated: { allowFrom: { demo: [] } } },
      channels: {
        demo: {
          allowFrom: ["channel-user"],
          accounts: {
            work: { allowFrom: ["account-user"] },
          },
        },
      },
    };

    const result = applyAllowFromFallbackTransition(cfg, {
      resolveCapabilities: (channelId) =>
        channelId === "demo"
          ? {
              elevatedAllowFromFallbackToAllowFrom: false,
              legacyDmElevatedAllowFromMigrationTarget: "tools.elevated.allowFrom",
            }
          : undefined,
    });

    expect(result.config).toBe(cfg);
    expect(result.config.tools?.elevated?.allowFrom?.demo).toEqual([]);
    expect(result.changes).toEqual([]);
  });
});
