import { JellyfishPluginBase } from '@balena/jellyfish-plugin-base';
import { actions } from './actions';
import { cards } from './cards';
import integrations from './integrations';

/**
 * The Front Jellyfish plugin.
 */
export class FrontPlugin extends JellyfishPluginBase {
	constructor() {
		super({
			slug: 'jellyfish-plugin-front',
			name: 'Front Plugin',
			version: '1.0.0',
			actions,
			cards,
			integrations,
			requires: [
				{
					slug: 'action-library',
					version: '>=15.x',
				},
				{
					slug: 'jellyfish-plugin-default',
					version: '>=19.x',
				},
			],
		});
	}
}
