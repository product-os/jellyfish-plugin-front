import { defaultEnvironment } from '@balena/jellyfish-environment';
import { testUtils as workerTestUtils } from '@balena/jellyfish-worker';
import _ from 'lodash';
import path from 'path';
import { frontPlugin } from '../../lib';
import webhooks from './webhooks';

const TOKEN = defaultEnvironment.integration.front;
let ctx: workerTestUtils.TestContext;

beforeAll(async () => {
	ctx = await workerTestUtils.newContext({
		plugins: [frontPlugin()],
	});

	// TODO: Improve translate test suite/protocol to avoid this
	const triggeredActions = await ctx.kernel.query(ctx.logContext, ctx.session, {
		type: 'object',
		properties: {
			type: {
				const: 'triggered-action@1.0.0',
			},
			active: {
				const: true,
			},
		},
	});
	await Promise.all(
		triggeredActions.map(async (triggeredAction) => {
			await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.session,
				`${triggeredAction.slug}@1.0.0`,
				[
					{
						op: 'replace',
						path: '/active',
						value: false,
					},
				],
			);
		}),
	);
	ctx.worker.setTriggers(ctx.logContext, []);

	await workerTestUtils.translateBeforeAll(ctx);
});

afterEach(async () => {
	await workerTestUtils.translateAfterEach(ctx);
});

afterAll(() => {
	workerTestUtils.translateAfterAll();
	return workerTestUtils.destroyContext(ctx);
});

describe('translate', () => {
	for (const testCaseName of Object.keys(webhooks)) {
		const testCase = webhooks[testCaseName];
		const expected = {
			head: testCase.expected.head,
			tail: _.sortBy(testCase.expected.tail, workerTestUtils.tailSort),
		};
		for (const variation of workerTestUtils.getVariations(testCase.steps, {
			permutations: true,
		})) {
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
						baseUrl: /(api2\.frontapp\.com|api\.intercom\.io)(:443)?$/,
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
									'data.status',
								],
							},
						},
					},
				);
			});
		}
	}
});
