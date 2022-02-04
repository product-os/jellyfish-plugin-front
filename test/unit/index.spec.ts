import { PluginManager } from '@balena/jellyfish-worker';
import { defaultPlugin } from '@balena/jellyfish-plugin-default';
import { frontPlugin } from '../../lib';

const pluginManager = new PluginManager([defaultPlugin(), frontPlugin()]);

test('Expected cards are loaded', () => {
	const cards = pluginManager.getCards();

	// Sanity check
	expect(cards['triggered-action-integration-front-mirror-event'].name).toEqual(
		'Triggered action for Front mirrors',
	);
});

test('Expected integrations are loaded', () => {
	const integrations = pluginManager.getSyncIntegrations();

	// Sanity check
	expect(Object.keys(integrations).includes('front')).toBeTruthy();
});
