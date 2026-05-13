import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import {
  getDoctorChannelCapabilities,
  type DoctorChannelCapabilities,
} from "../channel-capabilities.js";
import type { DoctorAccountRecord, DoctorAllowFromList } from "../types.js";
import { hasAllowFromEntries } from "./allowlist.js";
import { shouldSkipChannelDoctorDefaultEmptyGroupAllowlistWarning } from "./channel-doctor.js";

type CollectEmptyAllowlistPolicyWarningsParams = {
  account: DoctorAccountRecord;
  channelName?: string;
  cfg?: OpenClawConfig;
  doctorFixCommand: string;
  parent?: DoctorAccountRecord;
  prefix: string;
  capabilities?: DoctorChannelCapabilities;
  shouldSkipDefaultEmptyGroupAllowlistWarning?: typeof shouldSkipChannelDoctorDefaultEmptyGroupAllowlistWarning;
};

function resolveCapabilities(params: CollectEmptyAllowlistPolicyWarningsParams) {
  return params.capabilities ?? getDoctorChannelCapabilities(params.channelName);
}

export function collectEmptyAllowlistPolicyWarningsForAccount(
  params: CollectEmptyAllowlistPolicyWarningsParams,
): string[] {
  const warnings: string[] = [];
  const dmEntry = params.account.dm;
  const dm =
    dmEntry && typeof dmEntry === "object" && !Array.isArray(dmEntry)
      ? (dmEntry as DoctorAccountRecord)
      : undefined;
  const parentDmEntry = params.parent?.dm;
  const parentDm =
    parentDmEntry && typeof parentDmEntry === "object" && !Array.isArray(parentDmEntry)
      ? (parentDmEntry as DoctorAccountRecord)
      : undefined;
  const dmPolicy =
    (params.account.dmPolicy as string | undefined) ??
    (dm?.policy as string | undefined) ??
    (params.parent?.dmPolicy as string | undefined) ??
    (parentDm?.policy as string | undefined) ??
    undefined;

  const topAllowFrom =
    (params.account.allowFrom as DoctorAllowFromList | undefined) ??
    (params.parent?.allowFrom as DoctorAllowFromList | undefined);
  const nestedAllowFrom = dm?.allowFrom as DoctorAllowFromList | undefined;
  const parentNestedAllowFrom = parentDm?.allowFrom as DoctorAllowFromList | undefined;
  const effectiveAllowFrom = topAllowFrom ?? nestedAllowFrom ?? parentNestedAllowFrom;

  if (dmPolicy === "allowlist" && !hasAllowFromEntries(effectiveAllowFrom)) {
    warnings.push(
      `- ${params.prefix}.dmPolicy is "allowlist" but allowFrom is empty — all DMs will be blocked. Add sender IDs to ${params.prefix}.allowFrom, or run "${params.doctorFixCommand}" to auto-migrate from pairing store when entries exist.`,
    );
  }

  const groupPolicy =
    (params.account.groupPolicy as string | undefined) ??
    (params.parent?.groupPolicy as string | undefined) ??
    undefined;
  const capabilities = resolveCapabilities(params);

  collectCommandFallbackRelianceWarnings({
    account: params.account,
    capabilities,
    cfg: params.cfg,
    effectiveAllowFrom,
    channelName: params.channelName,
    groupPolicy,
    parent: params.parent,
    prefix: params.prefix,
    warnings,
  });

  if (groupPolicy !== "allowlist" || !capabilities.warnOnEmptyGroupSenderAllowlist) {
    return warnings;
  }

  if (
    params.channelName &&
    (
      params.shouldSkipDefaultEmptyGroupAllowlistWarning ??
      shouldSkipChannelDoctorDefaultEmptyGroupAllowlistWarning
    )({
      account: params.account,
      channelName: params.channelName,
      cfg: params.cfg,
      dmPolicy,
      effectiveAllowFrom,
      parent: params.parent,
      prefix: params.prefix,
    })
  ) {
    return warnings;
  }

  const rawGroupAllowFrom =
    (params.account.groupAllowFrom as DoctorAllowFromList | undefined) ??
    (params.parent?.groupAllowFrom as DoctorAllowFromList | undefined);
  // Match runtime semantics: resolveGroupAllowFromSources treats empty arrays as
  // unset and falls back to allowFrom.
  const groupAllowFrom = hasAllowFromEntries(rawGroupAllowFrom) ? rawGroupAllowFrom : undefined;
  const fallbackToAllowFrom = capabilities.groupAllowFromFallbackToAllowFrom;
  const effectiveGroupAllowFrom =
    groupAllowFrom ?? (fallbackToAllowFrom ? effectiveAllowFrom : undefined);

  if (fallbackToAllowFrom && !groupAllowFrom && hasAllowFromEntries(effectiveAllowFrom)) {
    warnings.push(
      `- ${params.prefix}.groupPolicy is "allowlist" and ${params.prefix}.groupAllowFrom is unset, so allowFrom is currently used as the group sender allowlist fallback. This behavior will be removed in future releases; set ${params.prefix}.groupAllowFrom explicitly.`,
    );
  }

  if (hasAllowFromEntries(effectiveGroupAllowFrom)) {
    return warnings;
  }

  if (fallbackToAllowFrom) {
    warnings.push(
      `- ${params.prefix}.groupPolicy is "allowlist" but groupAllowFrom (and allowFrom) is empty — all group messages will be silently dropped. Add sender IDs to ${params.prefix}.groupAllowFrom or ${params.prefix}.allowFrom, or set groupPolicy to "open".`,
    );
  } else {
    warnings.push(
      `- ${params.prefix}.groupPolicy is "allowlist" but groupAllowFrom is empty — this channel does not fall back to allowFrom, so all group messages will be silently dropped. Add sender IDs to ${params.prefix}.groupAllowFrom, or set groupPolicy to "open".`,
    );
  }

  return warnings;
}

function collectCommandFallbackRelianceWarnings(params: {
  account: DoctorAccountRecord;
  capabilities: DoctorChannelCapabilities;
  cfg?: OpenClawConfig;
  effectiveAllowFrom?: DoctorAllowFromList;
  channelName?: string;
  groupPolicy?: string;
  parent?: DoctorAccountRecord;
  prefix: string;
  warnings: string[];
}): void {
  if (!hasAllowFromEntries(params.effectiveAllowFrom)) {
    return;
  }
  const commandGroupFallback = params.capabilities.legacyDmCommandGroupAllowFromMigrationTarget
    ? (params.capabilities.commandGroupAllowFromFallbackToAllowFrom ??
      params.capabilities.groupAllowFromFallbackToAllowFrom)
    : false;
  const commandGroupCoveredByGroupAllowFrom = hasAllowFromEntries(
    readAllowFromTarget(params.account, params.parent, "groupAllowFrom"),
  );
  const shouldWarnForGroupCommands =
    params.groupPolicy !== "disabled" &&
    (params.capabilities.supportsGroupChats || hasGroupCommandAuthorizationConfig(params));
  if (
    shouldWarnForGroupCommands &&
    commandGroupFallback &&
    !hasExplicitAllowFromTarget(params.account, params.parent, "commandGroupAllowFrom") &&
    !commandGroupCoveredByGroupAllowFrom
  ) {
    params.warnings.push(
      `- ${params.prefix} group command authorization currently uses allowFrom as the group command allowlist fallback because commandGroupAllowFrom is unset. This behavior will be removed in future releases; set ${params.prefix}.commandGroupAllowFrom explicitly.`,
    );
  }
  if (
    shouldWarnForGroupCommands &&
    params.capabilities.groupOwnerAllowFromFallbackToAllowFrom &&
    params.capabilities.groupOwnerAllowFromFallbackToAllowFromExplicit === true &&
    !hasExplicitAllowFromTarget(params.account, params.parent, "groupOwnerAllowFrom")
  ) {
    params.warnings.push(
      `- ${params.prefix} group command-owner authorization currently uses allowFrom as the group command-owner fallback because groupOwnerAllowFrom is unset. This behavior will be removed in future releases; set ${params.prefix}.groupOwnerAllowFrom explicitly.`,
    );
  }
  if (
    params.cfg &&
    params.channelName &&
    params.capabilities.commandAllowFromFallbackToAllowFrom &&
    params.capabilities.legacyDmCommandAllowFromMigrationTarget &&
    !hasExplicitProviderAllowFromTarget(params.cfg?.commands?.allowFrom, params.channelName, {
      includeGlobal: true,
    })
  ) {
    params.warnings.push(
      `- ${params.prefix} command authorization currently uses allowFrom as the command allowlist fallback because commands.allowFrom.${params.channelName} is unset. This behavior will be removed in future releases; set commands.allowFrom.${params.channelName} explicitly.`,
    );
  }
  if (
    params.cfg &&
    params.channelName &&
    params.capabilities.elevatedAllowFromFallbackToAllowFrom &&
    !hasExplicitProviderAllowFromTarget(params.cfg?.tools?.elevated?.allowFrom, params.channelName)
  ) {
    params.warnings.push(
      `- ${params.prefix} elevated authorization currently uses allowFrom as the elevated allowlist fallback because tools.elevated.allowFrom.${params.channelName} is unset. This behavior will be removed in future releases; set tools.elevated.allowFrom.${params.channelName} explicitly.`,
    );
  }
}

function hasGroupCommandAuthorizationConfig(params: {
  account: DoctorAccountRecord;
  capabilities: DoctorChannelCapabilities;
  parent?: DoctorAccountRecord;
}): boolean {
  return (
    params.capabilities.commandGroupAllowFromFallbackToAllowFrom !== undefined ||
    params.capabilities.legacyDmCommandGroupAllowFromMigrationTarget !== undefined ||
    params.capabilities.legacyDmGroupOwnerAllowFromMigrationTarget !== undefined ||
    Array.isArray(params.account.groupAllowFrom) ||
    Array.isArray(params.parent?.groupAllowFrom) ||
    Array.isArray(params.account.commandGroupAllowFrom) ||
    Array.isArray(params.parent?.commandGroupAllowFrom) ||
    Array.isArray(params.account.groupOwnerAllowFrom) ||
    Array.isArray(params.parent?.groupOwnerAllowFrom)
  );
}

function hasExplicitAllowFromTarget(
  account: DoctorAccountRecord,
  parent: DoctorAccountRecord | undefined,
  key: "commandGroupAllowFrom" | "groupOwnerAllowFrom",
): boolean {
  return Array.isArray(account[key]) || Array.isArray(parent?.[key]);
}

function readAllowFromTarget(
  account: DoctorAccountRecord,
  parent: DoctorAccountRecord | undefined,
  key: "groupAllowFrom",
): DoctorAllowFromList | undefined {
  const own = account[key];
  if (Array.isArray(own)) {
    return own as DoctorAllowFromList;
  }
  const inherited = parent?.[key];
  return Array.isArray(inherited) ? (inherited as DoctorAllowFromList) : undefined;
}

function hasExplicitProviderAllowFromTarget(
  allowFromByProvider: unknown,
  channelName: string | undefined,
  options: { includeGlobal?: boolean } = {},
): boolean {
  if (!channelName || !allowFromByProvider || typeof allowFromByProvider !== "object") {
    return false;
  }
  const allowFromRecord = allowFromByProvider as Record<string, unknown>;
  return (
    Object.hasOwn(allowFromRecord, channelName) ||
    (options.includeGlobal === true && Object.hasOwn(allowFromRecord, "*"))
  );
}
