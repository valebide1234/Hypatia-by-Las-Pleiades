import { ENABLE_MOCK_DISCOVERY } from "./config";
import type { DiscoveryProvider } from "./DiscoveryProvider";
import { mockDiscoveryProvider } from "./mockProvider";

/**
 * Registered discovery providers. Add the real engine here (see docs/DISCOVERY_INTEGRATION.md).
 * `includeMock` defaults to the ENABLE_MOCK_DISCOVERY flag; it is a parameter only for tests.
 */
export function getDiscoveryProviders(includeMock: boolean = ENABLE_MOCK_DISCOVERY): DiscoveryProvider[] {
  const providers: DiscoveryProvider[] = [
    // e.g. hypatiaEngineProvider,
  ];
  if (includeMock) providers.push(mockDiscoveryProvider);
  return providers;
}
