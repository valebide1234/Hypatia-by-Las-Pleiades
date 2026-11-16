import { ENABLE_MOCK_DISCOVERY } from "./config";
import type { DiscoveryProvider } from "./DiscoveryProvider";
import { hypatiaEngineProvider } from "./engine/engineProvider";
import { mockDiscoveryProvider } from "./mockProvider";

/**
 * Registered discovery providers, the Hypatia engine first (see docs/DISCOVERY_INTEGRATION.md).
 * `includeMock` defaults to the ENABLE_MOCK_DISCOVERY flag; it is a parameter only for tests.
 */
export function getDiscoveryProviders(includeMock: boolean = ENABLE_MOCK_DISCOVERY): DiscoveryProvider[] {
  const providers: DiscoveryProvider[] = [hypatiaEngineProvider];
  if (includeMock) providers.push(mockDiscoveryProvider);
  return providers;
}
