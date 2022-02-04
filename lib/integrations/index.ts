import type { IntegrationDefinition, Map } from '@balena/jellyfish-worker';
import { frontIntegrationDefinition } from './front';

export const integrations: Map<IntegrationDefinition> = {
	front: frontIntegrationDefinition,
};
