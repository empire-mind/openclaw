import { describe, expect, it } from "vitest";
import {
  resolveDmGroupAccessWithCommandGate,
  resolveDmGroupAccessWithLists,
} from "./dm-policy-shared.js";

describe("deprecated DM/group policy shared helper", () => {
  it("honors the group allowFrom fallback flag", () => {
    const base = {
      isGroup: true,
      dmPolicy: "allowlist",
      groupPolicy: "allowlist",
      allowFrom: ["user:1"],
      isSenderAllowed: (entries: string[]) => entries.includes("user:1"),
    };

    expect(
      resolveDmGroupAccessWithLists({
        ...base,
        groupAllowFromFallbackToAllowFrom: true,
      }).decision,
    ).toBe("allow");
    expect(
      resolveDmGroupAccessWithLists({
        ...base,
        groupAllowFromFallbackToAllowFrom: false,
      }).decision,
    ).toBe("block");
  });

  it("uses explicit commandGroupAllowFrom before command group fallback", () => {
    const base = {
      isGroup: true,
      dmPolicy: "allowlist",
      groupPolicy: "open",
      allowFrom: [],
      groupAllowFrom: ["group-user"],
      groupAllowFromFallbackToAllowFrom: true,
      isSenderAllowed: (entries: string[]) => entries.includes("group-user"),
    };

    expect(
      resolveDmGroupAccessWithCommandGate({
        ...base,
        command: {
          useAccessGroups: true,
          allowTextCommands: true,
          hasControlCommand: true,
        },
      }).commandAuthorized,
    ).toBe(true);
    expect(
      resolveDmGroupAccessWithCommandGate({
        ...base,
        command: {
          useAccessGroups: true,
          allowTextCommands: true,
          hasControlCommand: true,
          commandGroupAllowFrom: [],
        },
      }).commandAuthorized,
    ).toBe(false);
  });
});
