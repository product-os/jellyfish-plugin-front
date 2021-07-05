/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { FrontPlugin } from '../../lib';

import { cardMixins } from '@balena/jellyfish-core';

const context = {
	id: 'jellyfish-plugin-front-test',
};

const plugin = new FrontPlugin();

test('Expected cards are loaded', () => {
	const cards = plugin.getCards(context, cardMixins);

	// Sanity check
	expect(cards['triggered-action-integration-front-mirror-event'].name).toEqual(
		'Triggered action for Front mirrors',
	);
});

test('Expected integrations are loaded', () => {
	const integrations = plugin.getSyncIntegrations(context);

	// Sanity check
	expect(integrations.front.slug).toEqual('front');
});
