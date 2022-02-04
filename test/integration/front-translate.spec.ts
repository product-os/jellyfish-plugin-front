import { defaultEnvironment } from '@balena/jellyfish-environment';
import { defaultPlugin } from '@balena/jellyfish-plugin-default';
import { productOsPlugin } from '@balena/jellyfish-plugin-product-os';
import { testUtils as workerTestUtils } from '@balena/jellyfish-worker';
import path from 'path';
import _ from 'lodash';
import { frontPlugin } from '../../lib';
import webhooks from './webhooks';

const TOKEN = defaultEnvironment.integration.front;
let ctx: workerTestUtils.TestContext;

beforeAll(async () => {
	ctx = await workerTestUtils.newContext({
		plugins: [productOsPlugin(), defaultPlugin(), frontPlugin()],
	});

	// Remove triggered-action-sync-thread-post-link-whisper from the worker
	// triggers as it interferes with the expected test suite result by causing
	// an extra whisper to be added to the timeline
	// TODO: Improve translate test suite/protocol to avoid this
	const triggers = ctx.worker.getTriggers().filter((trigger) => {
		return trigger.slug !== 'triggered-action-sync-thread-post-link-whisper';
	});

	ctx.worker.setTriggers(ctx.logContext, triggers);

	await workerTestUtils.translateBeforeAll(ctx);
});

afterEach(async () => {
	await workerTestUtils.translateAfterEach(ctx);
});

afterAll(() => {
	return workerTestUtils.destroyContext(ctx);
});

describe('front-translate', () => {
	for (const testCaseName of Object.keys(webhooks)) {
		const testCase = webhooks[testCaseName];
		const expected = {
			head: testCase.expected.head,
			tail: _.sortBy(testCase.expected.tail, workerTestUtils.tailSort),
		};
		for (const variation of workerTestUtils.getVariations(testCase.steps, {
			permutations: true,
		})) {
			if (variation.combination.length !== testCase.steps.length) {
				continue;
			}

			test(`(${variation.name}) ${testCaseName}`, async () => {
				await workerTestUtils.webhookScenario(
					ctx,
					{
						steps: variation.combination,
						prepareEvent: async (event: any): Promise<any> => {
							return event;
						},
						offset:
							_.findIndex(testCase.steps, _.first(variation.combination)) + 1,
						headIndex: testCase.headIndex || 0,
						original: testCase.steps,
						ignoreUpdateEvents: true,
						expected: _.cloneDeep(expected),
						name: testCaseName,
						variant: variation.name,
					},
					{
						source: 'front',
						baseUrl: /(api2.frontapp.com|api.intercom.io)(:443)?$/,
						uriPath: /.*/,
						basePath: path.join(__dirname, 'webhooks'),
						isAuthorized: (request: any) => {
							return (
								request.options.headers.authorization ===
									`Bearer ${TOKEN.api}` ||
								request.options.headers.authorization.startsWith('Basic')
							);
						},
						head: {
							ignore: {
								'support-thread': [
									'data.participants',
									'data.mentionsUser',
									'data.lastMessage',
									'tags',
								],
							},
						},
					},
				);
			});
		}
	}
});
