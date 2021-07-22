/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import ActionLibrary from '@balena/jellyfish-action-library';
import { defaultEnvironment } from '@balena/jellyfish-environment';
import { DefaultPlugin } from '@balena/jellyfish-plugin-default';
import { ProductOsPlugin } from '@balena/jellyfish-plugin-product-os';
import { syncIntegrationScenario } from '@balena/jellyfish-test-harness';
import { FrontPlugin } from '../../lib';
import webhooks from './webhooks/front';

const TOKEN = defaultEnvironment.integration.front;

syncIntegrationScenario.run(
	{
		test,
		before: beforeAll,
		beforeEach,
		after: afterAll,
		afterEach,
	},
	{
		basePath: __dirname,
		plugins: [ActionLibrary, DefaultPlugin, ProductOsPlugin, FrontPlugin],
		cards: [
			'support-thread',
			'sales-thread',
			'whisper',
			'message',
			'loop-balena-io',
		],
		scenarios: webhooks,
		baseUrl: /(api2.frontapp.com|api.intercom.io)(:443)?$/,
		stubRegex: /.*/,
		source: 'front',
		options: {
			token: TOKEN,
		},
		isAuthorized: (self: any, request: any) => {
			return (
				request.options.headers.authorization ===
					`Bearer ${self.options.token.api}` ||
				request.options.headers.authorization.startsWith('Basic')
			);
		},
	},
);
