import { describe, expect, it } from "vitest";
import type { PluginManifestRecord } from "../plugins/manifest-registry.js";
import { materializeRuntimeConfig } from "./materialize.js";
import type { OpenClawConfig } from "./types.openclaw.js";

describe("runtime config materialization", () => {
  it("does not run allowFrom fallback transition during runtime materialization", () => {
    const result = materializeRuntimeConfig(
      {
        channels: {
          demo: {
            allowFrom: ["user:1"],
          },
        },
      } as OpenClawConfig,
      "load",
      {
        manifestRegistry: {
          plugins: [
            {
              channelCatalogMeta: {
                id: "demo",
                doctorCapabilities: {
                  groupAllowFromFallbackToAllowFrom: false,
                  legacyDmAllowFromMigrationTarget: "groupAllowFrom",
                },
              },
            } as unknown as PluginManifestRecord,
          ],
        },
      },
    );

    expect(result.channels?.demo).toMatchObject({
      allowFrom: ["user:1"],
    });
    expect(result.channels?.demo).not.toHaveProperty("groupAllowFrom");
  });
});
