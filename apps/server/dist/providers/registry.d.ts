/** Adapter registry: protocol → adapter instance. */
import type { ProviderProtocol } from '@opencouncil/shared';
import type { ProviderAdapter } from './types.js';
export declare function getAdapter(protocol: ProviderProtocol): ProviderAdapter;
