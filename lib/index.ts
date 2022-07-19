import type { PluginDefinition } from '@balena/jellyfish-worker';
import { actions } from './actions';
import { contracts } from './contracts';
import { integrations } from './integrations';

// tslint:disable-next-line: no-var-requires
const { version } = require('../package.json');

/**
 * The Front Jellyfish plugin.
 */
export const frontPlugin = (): PluginDefinition => {
	return {
		slug: 'plugin-front',
		name: 'Front Plugin',
		version,
		contracts,
		actions,
		integrationMap: integrations,
	};
};
