import { describe, expect, it, vi } from "vitest";
import type { DoctorChannelCapabilities } from "../channel-capabilities.js";
import { collectEmptyAllowlistPolicyWarningsForAccount } from "./empty-allowlist-policy.js";

vi.mock("../channel-capabilities.js", () => ({
  getDoctorChannelCapabilities: (channelName?: string) => ({
    dmAllowFromMode: "topOnly",
    groupModel: channelName === "discord" ? "route" : "sender",
    supportsGroupChats: true,
    groupAllowFromFallbackToAllowFrom: channelName !== "imessage",
    warnOnEmptyGroupSenderAllowlist: channelName !== "discord",
  }),
}));

vi.mock("./channel-doctor.js", () => ({
  shouldSkipChannelDoctorDefaultEmptyGroupAllowlistWarning: ({
    channelName,
  }: {
    channelName?: string;
  }) => channelName === "zalouser",
}));

const baseCapabilities = (
  overrides: Partial<DoctorChannelCapabilities> = {},
): DoctorChannelCapabilities => ({
  dmAllowFromMode: "topOnly",
  groupModel: "sender",
  supportsGroupChats: true,
  groupAllowFromFallbackToAllowFrom: true,
  groupOwnerAllowFromFallbackToAllowFrom: true,
  commandAllowFromFallbackToAllowFrom: true,
  elevatedAllowFromFallbackToAllowFrom: true,
  warnOnEmptyGroupSenderAllowlist: true,
  ...overrides,
});

function expectFutureRemovalWarningWithoutDoctorText(warnings: string[]): void {
  const text = warnings.join("\n");
  expect(text).toContain("will be removed in future releases");
  expect(text).not.toContain("doctor");
}

describe("doctor empty allowlist policy warnings", () => {
  it("warns when dm allowlist mode has no allowFrom entries", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { dmPolicy: "allowlist" },
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toEqual([
      '- channels.signal.dmPolicy is "allowlist" but allowFrom is empty — all DMs will be blocked. Add sender IDs to channels.signal.allowFrom, or run "openclaw doctor --fix" to auto-migrate from pairing store when entries exist.',
    ]);
  });

  it("warns when non-telegram group allowlist mode does not fall back to allowFrom", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { groupPolicy: "allowlist" },
      channelName: "imessage",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.imessage",
    });

    expect(warnings).toEqual([
      '- channels.imessage.groupPolicy is "allowlist" but groupAllowFrom is empty — this channel does not fall back to allowFrom, so all group messages will be silently dropped. Add sender IDs to channels.imessage.groupAllowFrom, or set groupPolicy to "open".',
    ]);
  });

  it("stays quiet for zalouser hybrid route-and-sender group access", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { groupPolicy: "allowlist" },
      channelName: "zalouser",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.zalouser",
    });

    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet for channels that do not use sender-based group allowlists", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { groupPolicy: "allowlist" },
      channelName: "discord",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.discord",
    });

    expect(warnings).toStrictEqual([]);
  });

  it("warns when group sender access relies on allowFrom fallback", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"], groupPolicy: "allowlist" },
      capabilities: baseCapabilities({
        commandGroupAllowFromFallbackToAllowFrom: false,
        groupOwnerAllowFromFallbackToAllowFrom: false,
      }),
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toEqual([
      '- channels.signal.groupPolicy is "allowlist" and channels.signal.groupAllowFrom is unset, so allowFrom is currently used as the group sender allowlist fallback. This behavior will be removed in future releases; set channels.signal.groupAllowFrom explicitly.',
    ]);
    expectFutureRemovalWarningWithoutDoctorText(warnings);
  });

  it("warns when group command access relies on allowFrom fallback", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"] },
      capabilities: baseCapabilities({
        commandGroupAllowFromFallbackToAllowFrom: true,
        legacyDmCommandGroupAllowFromMigrationTarget: "commandGroupAllowFrom",
        groupOwnerAllowFromFallbackToAllowFrom: false,
      }),
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toEqual([
      "- channels.signal group command authorization currently uses allowFrom as the group command allowlist fallback because commandGroupAllowFrom is unset. This behavior will be removed in future releases; set channels.signal.commandGroupAllowFrom explicitly.",
    ]);
    expectFutureRemovalWarningWithoutDoctorText(warnings);
  });

  it("stays quiet for group command fallback when commandGroupAllowFrom is unsupported", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"] },
      capabilities: baseCapabilities({
        groupOwnerAllowFromFallbackToAllowFrom: false,
      }),
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet for group command fallback when groupPolicy is disabled", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"], groupPolicy: "disabled" },
      capabilities: baseCapabilities({
        commandAllowFromFallbackToAllowFrom: false,
        commandGroupAllowFromFallbackToAllowFrom: true,
        elevatedAllowFromFallbackToAllowFrom: false,
        groupOwnerAllowFromFallbackToAllowFrom: true,
        groupOwnerAllowFromFallbackToAllowFromExplicit: true,
      }),
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet for group command fallback on direct-only channels", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"] },
      capabilities: baseCapabilities({
        supportsGroupChats: false,
      }),
      channelName: "directonly",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.directonly",
    });

    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet for command group fallback when groupAllowFrom is configured", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: {
        allowFrom: ["dm-user"],
        groupAllowFrom: ["group-user"],
      },
      capabilities: baseCapabilities({
        commandGroupAllowFromFallbackToAllowFrom: true,
        groupOwnerAllowFromFallbackToAllowFrom: false,
        commandAllowFromFallbackToAllowFrom: false,
        elevatedAllowFromFallbackToAllowFrom: false,
      }),
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toStrictEqual([]);
  });

  it("warns when group command-owner access relies on allowFrom fallback", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"] },
      capabilities: baseCapabilities({
        commandGroupAllowFromFallbackToAllowFrom: false,
        groupOwnerAllowFromFallbackToAllowFrom: true,
        groupOwnerAllowFromFallbackToAllowFromExplicit: true,
      }),
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toEqual([
      "- channels.signal group command-owner authorization currently uses allowFrom as the group command-owner fallback because groupOwnerAllowFrom is unset. This behavior will be removed in future releases; set channels.signal.groupOwnerAllowFrom explicitly.",
    ]);
    expectFutureRemovalWarningWithoutDoctorText(warnings);
  });

  it("stays quiet for group command-owner fallback when support is only defaulted", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"] },
      capabilities: baseCapabilities({
        commandAllowFromFallbackToAllowFrom: false,
        commandGroupAllowFromFallbackToAllowFrom: false,
        elevatedAllowFromFallbackToAllowFrom: false,
        groupOwnerAllowFromFallbackToAllowFrom: true,
      }),
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toStrictEqual([]);
  });

  it("warns when command and elevated authorization rely on allowFrom fallback", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"] },
      capabilities: baseCapabilities({
        commandGroupAllowFromFallbackToAllowFrom: false,
        legacyDmCommandAllowFromMigrationTarget: "commands.allowFrom",
        groupOwnerAllowFromFallbackToAllowFrom: false,
      }),
      cfg: { channels: { signal: {} } },
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toEqual([
      "- channels.signal command authorization currently uses allowFrom as the command allowlist fallback because commands.allowFrom.signal is unset. This behavior will be removed in future releases; set commands.allowFrom.signal explicitly.",
      "- channels.signal elevated authorization currently uses allowFrom as the elevated allowlist fallback because tools.elevated.allowFrom.signal is unset. This behavior will be removed in future releases; set tools.elevated.allowFrom.signal explicitly.",
    ]);
    expectFutureRemovalWarningWithoutDoctorText(warnings);
  });

  it("stays quiet for command fallback when support is only defaulted", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"] },
      capabilities: baseCapabilities({
        commandGroupAllowFromFallbackToAllowFrom: false,
        elevatedAllowFromFallbackToAllowFrom: false,
        groupOwnerAllowFromFallbackToAllowFrom: false,
      }),
      cfg: { channels: { signal: {} } },
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet for command and elevated fallback when explicit empty provider targets are configured", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"] },
      capabilities: baseCapabilities({
        commandGroupAllowFromFallbackToAllowFrom: false,
        groupOwnerAllowFromFallbackToAllowFrom: false,
      }),
      cfg: {
        channels: { signal: {} },
        commands: { allowFrom: { signal: [] } },
        tools: { elevated: { allowFrom: { signal: [] } } },
      },
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toStrictEqual([]);
  });

  it("honors global command allowlist before warning about command fallback", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["user:1"] },
      capabilities: baseCapabilities({
        commandGroupAllowFromFallbackToAllowFrom: false,
        groupOwnerAllowFromFallbackToAllowFrom: false,
        elevatedAllowFromFallbackToAllowFrom: false,
      }),
      cfg: {
        channels: { signal: {} },
        commands: { allowFrom: { "*": ["global-user"] } },
      },
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toStrictEqual([]);
  });

  it("treats wildcard-only allowFrom entries as fallback reliance", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: { allowFrom: ["*"] },
      capabilities: baseCapabilities({
        commandGroupAllowFromFallbackToAllowFrom: true,
        legacyDmCommandGroupAllowFromMigrationTarget: "commandGroupAllowFrom",
        groupOwnerAllowFromFallbackToAllowFrom: false,
      }),
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      prefix: "channels.signal",
    });

    expect(warnings).toEqual([
      "- channels.signal group command authorization currently uses allowFrom as the group command allowlist fallback because commandGroupAllowFrom is unset. This behavior will be removed in future releases; set channels.signal.commandGroupAllowFrom explicitly.",
    ]);
    expectFutureRemovalWarningWithoutDoctorText(warnings);
  });

  it("stays quiet when explicit empty command fallback targets are configured", () => {
    const warnings = collectEmptyAllowlistPolicyWarningsForAccount({
      account: {
        allowFrom: ["user:1"],
        commandGroupAllowFrom: [],
      },
      capabilities: baseCapabilities({
        commandGroupAllowFromFallbackToAllowFrom: true,
        legacyDmCommandGroupAllowFromMigrationTarget: "commandGroupAllowFrom",
        groupOwnerAllowFromFallbackToAllowFrom: true,
      }),
      channelName: "signal",
      doctorFixCommand: "openclaw doctor --fix",
      parent: { groupOwnerAllowFrom: [] },
      prefix: "channels.signal",
    });

    expect(warnings).toStrictEqual([]);
  });
});
