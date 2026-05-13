import type { PluginManifestRegistry } from "../plugins/manifest-registry.js";
import type { PluginPackageChannelDoctorCapabilities } from "../plugins/manifest.js";
import { normalizeOptionalLowercaseString } from "../shared/string-coerce.js";
import { normalizeStringEntries } from "../shared/string-normalization.js";
import type { OpenClawConfig } from "./types.openclaw.js";

type ChannelRecord = Record<string, unknown>;

type MigrationFamily =
  | "group-sender"
  | "command-group"
  | "group-command-owner"
  | "command-allow"
  | "elevated-allow";

type LocalTarget =
  | "groupAllowFrom"
  | "groupSenderAllowFrom"
  | "groupOwnerAllowFrom"
  | "commandGroupAllowFrom";

export type AllowFromFallbackTransitionClassification = {
  family: MigrationFamily;
  prefix: string;
  recordPath: readonly string[];
  channelName: string;
  target?: LocalTarget | "commands.allowFrom" | "tools.elevated.allowFrom";
  fallbackDisabled: boolean;
  migrationEligible: boolean;
  warningNeeded: boolean;
  migratedEntries: string[];
  noMutationReason?:
    | "fallback_enabled"
    | "missing_target"
    | "explicit_target"
    | "inherited_target"
    | "account_scoped_entries"
    | "no_dm_allowfrom"
    | "no_migratable_entries"
    | "disabled";
};

type EffectiveCapabilities = {
  dmAllowFromMode: "topOnly" | "topOrNested" | "nestedOnly";
  groupModel: "sender" | "route" | "hybrid";
  groupAllowFromFallbackToAllowFrom: boolean;
  legacyDmAllowFromMigrationTarget?: "groupAllowFrom" | "groupSenderAllowFrom";
  groupOwnerAllowFromFallbackToAllowFrom: boolean;
  legacyDmGroupOwnerAllowFromMigrationTarget?: "groupOwnerAllowFrom";
  commandGroupAllowFromFallbackToAllowFrom: boolean;
  legacyDmCommandGroupAllowFromMigrationTarget?: "commandGroupAllowFrom";
  commandAllowFromFallbackToAllowFrom: boolean;
  legacyDmCommandAllowFromMigrationTarget?: "commands.allowFrom";
  elevatedAllowFromFallbackToAllowFrom: boolean;
  legacyDmElevatedAllowFromMigrationTarget?: "tools.elevated.allowFrom";
};

const PSEUDO_CHANNEL_KEYS = new Set(["defaults", "modelByChannel"]);
const DM_ALLOW_FROM_MODES: ReadonlySet<
  NonNullable<PluginPackageChannelDoctorCapabilities["dmAllowFromMode"]>
> = new Set(["topOnly", "topOrNested", "nestedOnly"]);
const GROUP_MODELS: ReadonlySet<NonNullable<PluginPackageChannelDoctorCapabilities["groupModel"]>> =
  new Set(["sender", "route", "hybrid"]);
const GROUP_ALLOW_FROM_MIGRATION_TARGETS: ReadonlySet<
  NonNullable<PluginPackageChannelDoctorCapabilities["legacyDmAllowFromMigrationTarget"]>
> = new Set(["groupAllowFrom", "groupSenderAllowFrom"]);
const GROUP_OWNER_MIGRATION_TARGETS: ReadonlySet<
  NonNullable<PluginPackageChannelDoctorCapabilities["legacyDmGroupOwnerAllowFromMigrationTarget"]>
> = new Set(["groupOwnerAllowFrom"]);
const COMMAND_GROUP_MIGRATION_TARGETS: ReadonlySet<
  NonNullable<
    PluginPackageChannelDoctorCapabilities["legacyDmCommandGroupAllowFromMigrationTarget"]
  >
> = new Set(["commandGroupAllowFrom"]);
const COMMAND_ALLOW_MIGRATION_TARGETS: ReadonlySet<
  NonNullable<PluginPackageChannelDoctorCapabilities["legacyDmCommandAllowFromMigrationTarget"]>
> = new Set(["commands.allowFrom"]);
const ELEVATED_ALLOW_MIGRATION_TARGETS: ReadonlySet<
  NonNullable<PluginPackageChannelDoctorCapabilities["legacyDmElevatedAllowFromMigrationTarget"]>
> = new Set(["tools.elevated.allowFrom"]);

function isRecord(value: unknown): value is ChannelRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwn(record: ChannelRecord | undefined, key: string): boolean {
  return Boolean(record && Object.prototype.hasOwnProperty.call(record, key));
}

function isDisabled(record: ChannelRecord | undefined): boolean {
  return record?.enabled === false;
}

function isPluginEntryDisabled(cfg: OpenClawConfig, pluginId: string): boolean {
  const entries = cfg.plugins?.entries;
  if (!isRecord(entries)) {
    return false;
  }
  const exactEntry = entries[pluginId];
  if (isRecord(exactEntry) && exactEntry.enabled === false) {
    return true;
  }
  const normalizedPluginId = normalizeOptionalLowercaseString(pluginId);
  if (!normalizedPluginId || normalizedPluginId === pluginId) {
    return false;
  }
  const normalizedEntry = entries[normalizedPluginId];
  return isRecord(normalizedEntry) && normalizedEntry.enabled === false;
}

function resolveManifestChannelOwner(
  channelId: string,
  manifestRegistry?: Pick<PluginManifestRegistry, "plugins">,
) {
  const normalized = normalizeOptionalLowercaseString(channelId) ?? channelId;
  return manifestRegistry?.plugins.find((record) => record.channelCatalogMeta?.id === normalized);
}

function isChannelTransitionDisabled(
  cfg: OpenClawConfig,
  channelName: string,
  manifestRegistry?: Pick<PluginManifestRegistry, "plugins">,
): boolean {
  if (isPluginEntryDisabled(cfg, channelName)) {
    return true;
  }
  const owner = resolveManifestChannelOwner(channelName, manifestRegistry);
  return owner ? isPluginEntryDisabled(cfg, owner.id) : false;
}

function readBooleanCapability(record: ChannelRecord, key: string): boolean | undefined {
  return typeof record[key] === "boolean" ? record[key] : undefined;
}

function readStringCapability<T extends string>(
  record: ChannelRecord,
  key: string,
  allowed: ReadonlySet<T>,
): T | undefined {
  const value = record[key];
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : undefined;
}

function normalizeTransitionCapabilities(
  capabilities?: PluginPackageChannelDoctorCapabilities,
): PluginPackageChannelDoctorCapabilities | undefined {
  if (!isRecord(capabilities)) {
    return undefined;
  }
  const normalized: PluginPackageChannelDoctorCapabilities = {};
  const dmAllowFromMode = readStringCapability<
    NonNullable<PluginPackageChannelDoctorCapabilities["dmAllowFromMode"]>
  >(capabilities, "dmAllowFromMode", DM_ALLOW_FROM_MODES);
  if (dmAllowFromMode) {
    normalized.dmAllowFromMode = dmAllowFromMode;
  }
  const groupModel = readStringCapability<
    NonNullable<PluginPackageChannelDoctorCapabilities["groupModel"]>
  >(capabilities, "groupModel", GROUP_MODELS);
  if (groupModel) {
    normalized.groupModel = groupModel;
  }
  const groupFallback = readBooleanCapability(capabilities, "groupAllowFromFallbackToAllowFrom");
  if (groupFallback !== undefined) {
    normalized.groupAllowFromFallbackToAllowFrom = groupFallback;
  }
  const groupMigrationTarget = readStringCapability<
    NonNullable<PluginPackageChannelDoctorCapabilities["legacyDmAllowFromMigrationTarget"]>
  >(capabilities, "legacyDmAllowFromMigrationTarget", GROUP_ALLOW_FROM_MIGRATION_TARGETS);
  if (groupMigrationTarget) {
    normalized.legacyDmAllowFromMigrationTarget = groupMigrationTarget;
  }
  const ownerFallback = readBooleanCapability(
    capabilities,
    "groupOwnerAllowFromFallbackToAllowFrom",
  );
  if (ownerFallback !== undefined) {
    normalized.groupOwnerAllowFromFallbackToAllowFrom = ownerFallback;
  }
  const ownerMigrationTarget = readStringCapability<
    NonNullable<
      PluginPackageChannelDoctorCapabilities["legacyDmGroupOwnerAllowFromMigrationTarget"]
    >
  >(capabilities, "legacyDmGroupOwnerAllowFromMigrationTarget", GROUP_OWNER_MIGRATION_TARGETS);
  if (ownerMigrationTarget) {
    normalized.legacyDmGroupOwnerAllowFromMigrationTarget = ownerMigrationTarget;
  }
  const commandGroupFallback = readBooleanCapability(
    capabilities,
    "commandGroupAllowFromFallbackToAllowFrom",
  );
  if (commandGroupFallback !== undefined) {
    normalized.commandGroupAllowFromFallbackToAllowFrom = commandGroupFallback;
  }
  const commandGroupMigrationTarget = readStringCapability<
    NonNullable<
      PluginPackageChannelDoctorCapabilities["legacyDmCommandGroupAllowFromMigrationTarget"]
    >
  >(capabilities, "legacyDmCommandGroupAllowFromMigrationTarget", COMMAND_GROUP_MIGRATION_TARGETS);
  if (commandGroupMigrationTarget) {
    normalized.legacyDmCommandGroupAllowFromMigrationTarget = commandGroupMigrationTarget;
  }
  const commandFallback = readBooleanCapability(
    capabilities,
    "commandAllowFromFallbackToAllowFrom",
  );
  if (commandFallback !== undefined) {
    normalized.commandAllowFromFallbackToAllowFrom = commandFallback;
  }
  const commandMigrationTarget = readStringCapability<
    NonNullable<PluginPackageChannelDoctorCapabilities["legacyDmCommandAllowFromMigrationTarget"]>
  >(capabilities, "legacyDmCommandAllowFromMigrationTarget", COMMAND_ALLOW_MIGRATION_TARGETS);
  if (commandMigrationTarget) {
    normalized.legacyDmCommandAllowFromMigrationTarget = commandMigrationTarget;
  }
  const elevatedFallback = readBooleanCapability(
    capabilities,
    "elevatedAllowFromFallbackToAllowFrom",
  );
  if (elevatedFallback !== undefined) {
    normalized.elevatedAllowFromFallbackToAllowFrom = elevatedFallback;
  }
  const elevatedMigrationTarget = readStringCapability<
    NonNullable<PluginPackageChannelDoctorCapabilities["legacyDmElevatedAllowFromMigrationTarget"]>
  >(capabilities, "legacyDmElevatedAllowFromMigrationTarget", ELEVATED_ALLOW_MIGRATION_TARGETS);
  if (elevatedMigrationTarget) {
    normalized.legacyDmElevatedAllowFromMigrationTarget = elevatedMigrationTarget;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function mergeCapabilities(
  capabilities?: PluginPackageChannelDoctorCapabilities,
): EffectiveCapabilities {
  const normalized = normalizeTransitionCapabilities(capabilities);
  return {
    dmAllowFromMode: normalized?.dmAllowFromMode ?? "topOnly",
    groupModel: normalized?.groupModel ?? "sender",
    groupAllowFromFallbackToAllowFrom: normalized?.groupAllowFromFallbackToAllowFrom ?? true,
    ...(normalized?.legacyDmAllowFromMigrationTarget
      ? { legacyDmAllowFromMigrationTarget: normalized.legacyDmAllowFromMigrationTarget }
      : {}),
    groupOwnerAllowFromFallbackToAllowFrom:
      normalized?.groupOwnerAllowFromFallbackToAllowFrom ?? true,
    ...(normalized?.legacyDmGroupOwnerAllowFromMigrationTarget
      ? {
          legacyDmGroupOwnerAllowFromMigrationTarget:
            normalized.legacyDmGroupOwnerAllowFromMigrationTarget,
        }
      : {}),
    commandGroupAllowFromFallbackToAllowFrom:
      normalized?.commandGroupAllowFromFallbackToAllowFrom ??
      normalized?.groupAllowFromFallbackToAllowFrom ??
      true,
    ...(normalized?.legacyDmCommandGroupAllowFromMigrationTarget
      ? {
          legacyDmCommandGroupAllowFromMigrationTarget:
            normalized.legacyDmCommandGroupAllowFromMigrationTarget,
        }
      : {}),
    commandAllowFromFallbackToAllowFrom: normalized?.commandAllowFromFallbackToAllowFrom ?? true,
    ...(normalized?.legacyDmCommandAllowFromMigrationTarget
      ? {
          legacyDmCommandAllowFromMigrationTarget:
            normalized.legacyDmCommandAllowFromMigrationTarget,
        }
      : {}),
    elevatedAllowFromFallbackToAllowFrom: normalized?.elevatedAllowFromFallbackToAllowFrom ?? true,
    ...(normalized?.legacyDmElevatedAllowFromMigrationTarget
      ? {
          legacyDmElevatedAllowFromMigrationTarget:
            normalized.legacyDmElevatedAllowFromMigrationTarget,
        }
      : {}),
  };
}

function resolveManifestCapabilities(
  channelId: string,
  manifestRegistry?: Pick<PluginManifestRegistry, "plugins">,
): PluginPackageChannelDoctorCapabilities | undefined {
  const manifest = resolveManifestChannelOwner(channelId, manifestRegistry)?.channelCatalogMeta
    ?.doctorCapabilities;
  return normalizeTransitionCapabilities(manifest);
}

function resolveCapabilities(params: {
  channelId: string;
  manifestRegistry?: Pick<PluginManifestRegistry, "plugins">;
  override?: (channelId: string) => PluginPackageChannelDoctorCapabilities | undefined;
}): EffectiveCapabilities {
  return mergeCapabilities(
    params.override?.(params.channelId) ??
      resolveManifestCapabilities(params.channelId, params.manifestRegistry),
  );
}

function readDmAllowFrom(
  record: ChannelRecord,
  parent: ChannelRecord | undefined,
  mode: EffectiveCapabilities["dmAllowFromMode"],
): unknown {
  const dm = isRecord(record.dm) ? record.dm : undefined;
  const parentDm = isRecord(parent?.dm) ? parent.dm : undefined;
  if (mode === "nestedOnly") {
    return dm?.allowFrom ?? record.allowFrom ?? parentDm?.allowFrom ?? parent?.allowFrom;
  }
  return record.allowFrom ?? dm?.allowFrom ?? parent?.allowFrom ?? parentDm?.allowFrom;
}

function readOwnDmAllowFrom(
  record: ChannelRecord,
  mode: EffectiveCapabilities["dmAllowFromMode"],
): unknown {
  const dm = isRecord(record.dm) ? record.dm : undefined;
  if (mode === "nestedOnly") {
    return hasOwn(dm, "allowFrom") ? dm?.allowFrom : record.allowFrom;
  }
  return hasOwn(record, "allowFrom") ? record.allowFrom : dm?.allowFrom;
}

function normalizeMigratedEntries(raw: unknown): string[] {
  return Array.from(new Set(Array.isArray(raw) ? normalizeStringEntries(raw) : []));
}

function enabledAccountRecords(channel: ChannelRecord): ChannelRecord[] {
  const accounts = isRecord(channel.accounts) ? channel.accounts : undefined;
  if (!accounts) {
    return [];
  }
  return Object.values(accounts).filter(
    (account): account is ChannelRecord => isRecord(account) && !isDisabled(account),
  );
}

function hasAccountScopedFallbackEntries(
  channel: ChannelRecord,
  capabilities: EffectiveCapabilities,
): boolean {
  const accounts = enabledAccountRecords(channel);
  return (
    accounts.length > 1 &&
    accounts.some(
      (account) => readOwnDmAllowFrom(account, capabilities.dmAllowFromMode) !== undefined,
    )
  );
}

function localTargetForFamily(
  family: MigrationFamily,
  capabilities: EffectiveCapabilities,
): LocalTarget | undefined {
  if (family === "group-sender") {
    return capabilities.legacyDmAllowFromMigrationTarget;
  }
  if (family === "command-group") {
    return capabilities.legacyDmCommandGroupAllowFromMigrationTarget;
  }
  if (family === "group-command-owner") {
    return capabilities.legacyDmGroupOwnerAllowFromMigrationTarget;
  }
  return undefined;
}

function fallbackDisabledForFamily(
  family: MigrationFamily,
  capabilities: EffectiveCapabilities,
): boolean {
  if (family === "group-sender") {
    return !capabilities.groupAllowFromFallbackToAllowFrom;
  }
  if (family === "command-group") {
    return !capabilities.commandGroupAllowFromFallbackToAllowFrom;
  }
  if (family === "group-command-owner") {
    return !capabilities.groupOwnerAllowFromFallbackToAllowFrom;
  }
  if (family === "command-allow") {
    return !capabilities.commandAllowFromFallbackToAllowFrom;
  }
  return !capabilities.elevatedAllowFromFallbackToAllowFrom;
}

function globalTargetForFamily(
  family: MigrationFamily,
  capabilities: EffectiveCapabilities,
): "commands.allowFrom" | "tools.elevated.allowFrom" | undefined {
  if (family === "command-allow") {
    return capabilities.legacyDmCommandAllowFromMigrationTarget;
  }
  if (family === "elevated-allow") {
    return capabilities.legacyDmElevatedAllowFromMigrationTarget;
  }
  return undefined;
}

function targetExists(record: ChannelRecord, parent: ChannelRecord | undefined, target: string) {
  return hasOwn(record, target) || hasOwn(parent, target);
}

function isLocalTarget(target: string): target is LocalTarget {
  return (
    target === "groupAllowFrom" ||
    target === "groupSenderAllowFrom" ||
    target === "groupOwnerAllowFrom" ||
    target === "commandGroupAllowFrom"
  );
}

function hasRuntimeCommandGroupSource(record: ChannelRecord | undefined): boolean {
  return normalizeMigratedEntries(record?.groupAllowFrom).length > 0;
}

function hasNonEmptyRuntimeGroupSenderTarget(record: ChannelRecord | undefined): boolean {
  return normalizeMigratedEntries(record?.groupAllowFrom).length > 0;
}

function hasExplicitRuntimeTargetForFamily(params: {
  family: MigrationFamily;
  record: ChannelRecord | undefined;
  target?: LocalTarget;
}): boolean {
  if (params.family === "group-sender") {
    if (hasOwn(params.record, "groupSenderAllowFrom")) {
      return true;
    }
    if (params.target === "groupSenderAllowFrom") {
      return false;
    }
    return hasNonEmptyRuntimeGroupSenderTarget(params.record);
  }
  if (params.family === "command-group") {
    return (
      hasOwn(params.record, "commandGroupAllowFrom") || hasRuntimeCommandGroupSource(params.record)
    );
  }
  if (params.family === "group-command-owner") {
    return hasOwn(params.record, "groupOwnerAllowFrom");
  }
  return false;
}

function classifyLocalFamily(params: {
  family: MigrationFamily;
  channelName: string;
  record: ChannelRecord;
  parent?: ChannelRecord;
  prefix: string;
  recordPath: readonly string[];
  capabilities: EffectiveCapabilities;
}): AllowFromFallbackTransitionClassification {
  const fallbackDisabled = fallbackDisabledForFamily(params.family, params.capabilities);
  const target = localTargetForFamily(params.family, params.capabilities);
  const rawDmAllowFrom = params.parent
    ? readOwnDmAllowFrom(params.record, params.capabilities.dmAllowFromMode)
    : readDmAllowFrom(params.record, undefined, params.capabilities.dmAllowFromMode);
  const migratedEntries = normalizeMigratedEntries(rawDmAllowFrom);
  const commandGroupCoveredByRecord =
    params.family === "command-group" && hasRuntimeCommandGroupSource(params.record);
  const commandGroupCoveredByParent =
    params.family === "command-group" && hasRuntimeCommandGroupSource(params.parent);
  const shouldPreserveEmptyAccountOverride =
    Boolean(params.parent) && Array.isArray(rawDmAllowFrom) && migratedEntries.length === 0;
  if (!fallbackDisabled) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: migratedEntries.length > 0,
      migratedEntries,
      noMutationReason: "fallback_enabled",
    };
  }
  if (commandGroupCoveredByRecord) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: false,
      migratedEntries,
      noMutationReason: "explicit_target",
    };
  }
  const shouldCopyOverEmptyGroupAllowFrom =
    params.family === "group-sender" &&
    target === "groupAllowFrom" &&
    hasOwn(params.record, target) &&
    normalizeMigratedEntries(params.record[target]).length === 0 &&
    migratedEntries.length > 0;
  if (target && hasOwn(params.record, target) && !shouldCopyOverEmptyGroupAllowFrom) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: false,
      migratedEntries,
      noMutationReason: "explicit_target",
    };
  }
  if (
    hasExplicitRuntimeTargetForFamily({
      family: params.family,
      record: params.record,
      target,
    })
  ) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: false,
      migratedEntries,
      noMutationReason: "explicit_target",
    };
  }
  if (target && shouldPreserveEmptyAccountOverride) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: true,
      warningNeeded: false,
      migratedEntries,
    };
  }
  if (commandGroupCoveredByParent) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: false,
      migratedEntries,
      noMutationReason: "inherited_target",
    };
  }
  if (
    hasExplicitRuntimeTargetForFamily({
      family: params.family,
      record: params.parent,
      target,
    })
  ) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: false,
      migratedEntries,
      noMutationReason: "inherited_target",
    };
  }
  if (!target) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: false,
      migratedEntries,
      noMutationReason: "missing_target",
    };
  }
  if (
    hasOwn(params.parent, target) &&
    !(
      params.family === "group-sender" &&
      target === "groupAllowFrom" &&
      normalizeMigratedEntries(params.parent?.[target]).length === 0 &&
      migratedEntries.length > 0
    )
  ) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: false,
      migratedEntries,
      noMutationReason: "inherited_target",
    };
  }
  if (migratedEntries.length === 0) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: false,
      migratedEntries,
      noMutationReason: "no_migratable_entries",
    };
  }
  return {
    family: params.family,
    prefix: params.prefix,
    recordPath: params.recordPath,
    channelName: params.channelName,
    target,
    fallbackDisabled,
    migrationEligible: true,
    warningNeeded: false,
    migratedEntries,
  };
}

function classifyGlobalFamily(params: {
  family: "command-allow" | "elevated-allow";
  channelName: string;
  record: ChannelRecord;
  prefix: string;
  recordPath: readonly string[];
  capabilities: EffectiveCapabilities;
  cfg: OpenClawConfig;
}): AllowFromFallbackTransitionClassification {
  const fallbackDisabled = fallbackDisabledForFamily(params.family, params.capabilities);
  const target = globalTargetForFamily(params.family, params.capabilities);
  const migratedEntries = collectProviderFallbackMigratedEntries(
    params.record,
    params.capabilities,
  );
  if (!fallbackDisabled || !target) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: fallbackDisabled ? false : migratedEntries.length > 0,
      migratedEntries,
      noMutationReason: fallbackDisabled ? "missing_target" : "fallback_enabled",
    };
  }
  const map =
    target === "commands.allowFrom"
      ? params.cfg.commands?.allowFrom
      : params.cfg.tools?.elevated?.allowFrom;
  const explicitTarget =
    isRecord(map) &&
    (hasOwn(map, params.channelName) || (target === "commands.allowFrom" && hasOwn(map, "*")));
  if (explicitTarget) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: false,
      migratedEntries,
      noMutationReason: "explicit_target",
    };
  }
  if (hasAccountScopedFallbackEntries(params.record, params.capabilities)) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: migratedEntries.length > 0,
      migratedEntries,
      noMutationReason: "account_scoped_entries",
    };
  }
  if (migratedEntries.length === 0) {
    return {
      family: params.family,
      prefix: params.prefix,
      recordPath: params.recordPath,
      channelName: params.channelName,
      target,
      fallbackDisabled,
      migrationEligible: false,
      warningNeeded: false,
      migratedEntries,
      noMutationReason: "no_migratable_entries",
    };
  }
  return {
    family: params.family,
    prefix: params.prefix,
    recordPath: params.recordPath,
    channelName: params.channelName,
    target,
    fallbackDisabled,
    migrationEligible: true,
    warningNeeded: false,
    migratedEntries,
  };
}

function collectProviderFallbackMigratedEntries(
  channel: ChannelRecord,
  capabilities: EffectiveCapabilities,
): string[] {
  const entries: string[] = [];
  const pushEntries = (raw: unknown) => {
    for (const entry of normalizeMigratedEntries(raw)) {
      if (!entries.includes(entry)) {
        entries.push(entry);
      }
    }
  };
  const accounts = enabledAccountRecords(channel);
  if (accounts.length === 1) {
    pushEntries(readDmAllowFrom(accounts[0], channel, capabilities.dmAllowFromMode));
    return entries;
  }
  if (accounts.length > 1 && hasAccountScopedFallbackEntries(channel, capabilities)) {
    for (const account of accounts) {
      pushEntries(readDmAllowFrom(account, channel, capabilities.dmAllowFromMode));
    }
    return entries;
  }
  pushEntries(readDmAllowFrom(channel, undefined, capabilities.dmAllowFromMode));
  return entries;
}

export function classifyAllowFromFallbackTransitions(
  cfg: OpenClawConfig,
  options: {
    manifestRegistry?: Pick<PluginManifestRegistry, "plugins">;
    resolveCapabilities?: (channelId: string) => PluginPackageChannelDoctorCapabilities | undefined;
  } = {},
): AllowFromFallbackTransitionClassification[] {
  if (cfg.plugins?.enabled === false || !isRecord(cfg.channels)) {
    return [];
  }
  const classifications: AllowFromFallbackTransitionClassification[] = [];
  for (const [channelName, rawChannel] of Object.entries(cfg.channels)) {
    if (PSEUDO_CHANNEL_KEYS.has(channelName) || !isRecord(rawChannel)) {
      continue;
    }
    if (
      isChannelTransitionDisabled(cfg, channelName, options.manifestRegistry) ||
      isDisabled(rawChannel)
    ) {
      continue;
    }
    const capabilities = resolveCapabilities({
      channelId: channelName,
      manifestRegistry: options.manifestRegistry,
      override: options.resolveCapabilities,
    });
    const prefix = `channels.${channelName}`;
    const recordPath = ["channels", channelName];
    for (const family of ["group-sender", "command-group", "group-command-owner"] as const) {
      classifications.push(
        classifyLocalFamily({
          family,
          channelName,
          record: rawChannel,
          prefix,
          recordPath,
          capabilities,
        }),
      );
    }
    for (const family of ["command-allow", "elevated-allow"] as const) {
      classifications.push(
        classifyGlobalFamily({
          family,
          channelName,
          record: rawChannel,
          prefix,
          recordPath,
          capabilities,
          cfg,
        }),
      );
    }
    const accounts = isRecord(rawChannel.accounts) ? rawChannel.accounts : undefined;
    if (!accounts) {
      continue;
    }
    for (const [accountId, rawAccount] of Object.entries(accounts)) {
      if (!isRecord(rawAccount) || isDisabled(rawAccount)) {
        continue;
      }
      const accountRecordPath = [...recordPath, "accounts", accountId];
      for (const family of ["group-sender", "command-group", "group-command-owner"] as const) {
        classifications.push(
          classifyLocalFamily({
            family,
            channelName,
            record: rawAccount,
            parent: rawChannel,
            prefix: `${prefix}.accounts.${accountId}`,
            recordPath: accountRecordPath,
            capabilities,
          }),
        );
      }
    }
  }
  return classifications;
}

function ensureMutableConfig(cfg: OpenClawConfig, current: OpenClawConfig): OpenClawConfig {
  return current === cfg ? structuredClone(cfg) : current;
}

export function applyAllowFromFallbackTransition(
  cfg: OpenClawConfig,
  options: {
    manifestRegistry?: Pick<PluginManifestRegistry, "plugins">;
    resolveCapabilities?: (channelId: string) => PluginPackageChannelDoctorCapabilities | undefined;
  } = {},
): { config: OpenClawConfig; changes: string[]; warnings: string[] } {
  let next = cfg;
  const changes: string[] = [];
  const warnings: string[] = [];
  for (const item of classifyAllowFromFallbackTransitions(cfg, options)) {
    if (!item.migrationEligible) {
      if (shouldWarnNoMutation(item, next)) {
        warnings.push(formatNoMutationWarning(item));
      }
      continue;
    }
    next = ensureMutableConfig(cfg, next);
    let changed = false;
    if (item.target === "commands.allowFrom") {
      next.commands = { ...next.commands };
      next.commands.allowFrom = { ...next.commands.allowFrom };
      next.commands.allowFrom[item.channelName] = item.migratedEntries;
      changed = true;
    } else if (item.target === "tools.elevated.allowFrom") {
      next.tools = { ...next.tools };
      next.tools.elevated = { ...next.tools.elevated };
      next.tools.elevated.allowFrom = { ...next.tools.elevated.allowFrom };
      next.tools.elevated.allowFrom[item.channelName] = item.migratedEntries;
      changed = true;
    } else if (item.target && isLocalTarget(item.target)) {
      const record = resolveRecordByPath(next, item.recordPath);
      if (
        record &&
        (!targetExists(record, undefined, item.target) || shouldOverwriteLocalTarget(item, record))
      ) {
        record[item.target] = item.migratedEntries;
        changed = true;
      }
    }
    if (changed) {
      changes.push(formatMutationChange(item));
    }
  }
  return { config: next, changes, warnings };
}

function shouldOverwriteLocalTarget(
  item: AllowFromFallbackTransitionClassification,
  record: ChannelRecord,
): boolean {
  return (
    item.family === "group-sender" &&
    item.target === "groupAllowFrom" &&
    normalizeMigratedEntries(record.groupAllowFrom).length === 0 &&
    item.migratedEntries.length > 0
  );
}

function shouldWarnNoMutation(
  item: AllowFromFallbackTransitionClassification,
  current: OpenClawConfig,
): boolean {
  return (
    item.warningNeeded &&
    item.noMutationReason !== "fallback_enabled" &&
    item.noMutationReason !== "explicit_target" &&
    item.noMutationReason !== "inherited_target" &&
    !isCommandGroupCoveredByCurrentConfig(item, current)
  );
}

function isCommandGroupCoveredByCurrentConfig(
  item: AllowFromFallbackTransitionClassification,
  current: OpenClawConfig,
): boolean {
  if (item.family !== "command-group") {
    return false;
  }
  const record = resolveRecordByPath(current, item.recordPath);
  if (hasRuntimeCommandGroupSource(record)) {
    return true;
  }
  return hasRuntimeCommandGroupSource(resolveParentRecordByPath(current, item.recordPath));
}

function resolveRecordByPath(
  cfg: OpenClawConfig,
  pathParts: readonly string[],
): ChannelRecord | undefined {
  let current: unknown = cfg;
  for (const part of pathParts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return isRecord(current) ? current : undefined;
}

function resolveParentRecordByPath(
  cfg: OpenClawConfig,
  pathParts: readonly string[],
): ChannelRecord | undefined {
  const accountsIndex = pathParts.indexOf("accounts");
  if (accountsIndex <= 0) {
    return undefined;
  }
  return resolveRecordByPath(cfg, pathParts.slice(0, accountsIndex));
}

function formatTargetPath(item: AllowFromFallbackTransitionClassification): string {
  if (item.target === "commands.allowFrom") {
    return `commands.allowFrom.${item.channelName}`;
  }
  if (item.target === "tools.elevated.allowFrom") {
    return `tools.elevated.allowFrom.${item.channelName}`;
  }
  return `${item.prefix}.${item.target}`;
}

function formatMutationChange(item: AllowFromFallbackTransitionClassification): string {
  const targetPath = formatTargetPath(item);
  if (item.migratedEntries.length === 0) {
    return `Set ${targetPath} to an explicit empty allowlist because ${item.family} fallback to allowFrom is disabled.`;
  }
  return `Copied ${item.prefix}.allowFrom entries to ${targetPath} because ${item.family} fallback to allowFrom is disabled.`;
}

function formatNoMutationWarning(item: AllowFromFallbackTransitionClassification): string {
  if (!item.target) {
    return `- ${item.prefix} still has allowFrom entries, but ${item.family} fallback to allowFrom is disabled and no automatic migration target is declared (${item.noMutationReason}). This fallback behavior will be removed in future releases; configure an explicit allowlist for this authorization mode.`;
  }
  return `- ${item.prefix} still has allowFrom entries, but ${item.family} fallback to allowFrom is disabled and ${formatTargetPath(item)} was not changed (${item.noMutationReason}). This fallback behavior will be removed in future releases; set ${formatTargetPath(item)} explicitly.`;
}
