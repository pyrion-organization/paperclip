import { describe, expect, it } from "vitest";
import {
  getProjectInfraProviderDescriptor,
  PROJECT_INFRA_PROVIDER_DESCRIPTORS,
  normalizeProjectInfraProviderKey,
} from "./constants.js";
import { createProjectInfraTargetSchema } from "./validators/project.js";

describe("project infra provider descriptors", () => {
  it("defines metadata-only provider capability descriptors", () => {
    const hetzner = getProjectInfraProviderDescriptor("Hetzner");

    expect(hetzner?.key).toBe("hetzner");
    expect(hetzner?.capabilities).toContain("floating_ip_failover");
    expect(hetzner?.credentialPolicy).toBe("external_secret_provider");
    expect(hetzner?.repairRequiresApproval).toBe(true);
    expect(PROJECT_INFRA_PROVIDER_DESCRIPTORS.every((provider) => provider.repairRequiresApproval)).toBe(true);
  });

  it("normalizes provider names for descriptor matching", () => {
    expect(normalizeProjectInfraProviderKey("AWS Lightsail")).toBe("aws_lightsail");
    expect(getProjectInfraProviderDescriptor("digital ocean")).toBeNull();
    expect(getProjectInfraProviderDescriptor("digitalocean")?.label).toBe("DigitalOcean");
  });

  it("rejects credentials in infrastructure target metadata", () => {
    const result = createProjectInfraTargetSchema.safeParse({
      name: "Primary VPS",
      provider: "hetzner",
      metadata: {
        apiToken: "secret-value",
      },
    });

    expect(result.success).toBe(false);
  });
});
