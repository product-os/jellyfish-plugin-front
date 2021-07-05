/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import ActionLibrary from '@balena/jellyfish-action-library';
import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import { PluginManager } from '@balena/jellyfish-plugin-base';
import { Sync } from '@balena/jellyfish-sync';
import Bluebird from 'bluebird';
import { Front } from 'front-sdk';
import _ from 'lodash';
import sinon from 'sinon';
import { v4 as uuidv4 } from 'uuid';
import { FrontPlugin } from '../../lib';

// tslint:disable-next-line: no-var-requires
const DefaultPlugin = require('@balena/jellyfish-plugin-default');

const TOKEN = environment.integration.front;
const context: any = {
	id: 'jellyfish-plugin-front-test',
};

// Because Front might take a while to process
// message creation requests.
// See: https://dev.frontapp.com/#receive-custom-message
async function retryWhile404(fn: any, times = 5): Promise<any> {
	try {
		return await fn();
	} catch (error) {
		if (error.status === 404 && times > 0) {
			await Bluebird.delay(500);
			return retryWhile404(fn, times - 1);
		}

		throw error;
	}
}

async function retryWhile429(fn: any, times = 100): Promise<any> {
	try {
		return await fn();
	} catch (error) {
		if (error.name === 'FrontError' && error.status === 429 && times > 0) {
			const delay =
				_.parseInt(_.first(error.message.match(/(\d+)/)) || '') || 2000;
			await Bluebird.delay(delay);
			return retryWhile429(fn, times - 1);
		}

		throw error;
	}
}

async function wait(fn: any, check: any, times = 8): Promise<any> {
	const result = await fn();
	if (check(result)) {
		return result;
	}

	if (times <= 0) {
		throw new Error('Timeout while waiting for check condition');
	}

	await Bluebird.delay(1000);
	return wait(fn, check, times - 1);
}

async function listResourceUntil(
	fn: any,
	id: string,
	predicate: any,
	retries = 10,
): Promise<any> {
	const result = await retryWhile429(() => {
		return fn({
			conversation_id: id,
		});
	});

	const elements = result._results.filter((element: any) => {
		// Ignore webhook errors, as we know already that
		// we are not listening to them in these tests.
		return element.error_type !== 'webhook_timeout';
	});

	if (predicate(elements)) {
		return elements;
	}

	if (retries <= 0) {
		throw new Error('Condition never true');
	}

	await Bluebird.delay(1000);
	return listResourceUntil(fn, id, predicate, retries - 1);
}

const sandbox = sinon.createSandbox();

const testMirroringOfComment = async (testContext: any, { message }) => {
	const supportThread = await testContext.startSupportThread(
		`My Issue ${uuidv4()}`,
		`Foo Bar ${uuidv4()}`,
		testContext.inboxes[0],
	);

	const messageCard = testContext.constructEvent({
		actor: testContext.mirrorOptions.actor,
		target: supportThread.id,
		message,
		type: 'whisper',
	});

	const getElementById = sandbox
		.stub()
		.onCall(0)
		.resolves(supportThread)
		.onCall(1)
		.resolves(testContext.user);

	const localContext = {
		...testContext.mirrorContext,
		getElementById,
	};

	const [syncedMessageCard] = await testContext.sync.mirror(
		'front',
		TOKEN,
		messageCard,
		localContext,
		testContext.mirrorOptions,
	);

	expect(syncedMessageCard.data.payload.message).toEqual(message);
	expect(syncedMessageCard.data.mirrors[0]).toBeTruthy();

	const comments = await testContext.getFrontCommentsUntil(
		_.last(supportThread.data.mirrors[0].split('/')),
		(elements: any) => {
			return elements.length > 0;
		},
	);

	expect(comments.length).toEqual(1);

	// Verify that the comments returned contain the expected value
	expect(comments[0].body).toEqual(message);
};

async function testArchivingOfThread(
	testContext: any,
	{ status },
): Promise<any> {
	const supportThread = await testContext.startSupportThread(
		`My Issue ${uuidv4()}`,
		`Foo Bar ${uuidv4()}`,
		testContext.inboxes[0],
	);

	const updatedSupportThread = _.merge({}, supportThread, {
		data: {
			status,
		},
	});

	const localContext = {
		...testContext.mirrorContext,
	};

	const [syncedThreadCard] = await testContext.sync.mirror(
		'front',
		TOKEN,
		updatedSupportThread,
		localContext,
		testContext.mirrorOptions,
	);

	expect(syncedThreadCard.id).toEqual(supportThread.id);

	const result = await wait(
		() => {
			return retryWhile429(() => {
				return testContext.front.conversation.get({
					conversation_id: _.last(supportThread.data.mirrors[0].split('/')),
				});
			});
		},
		(conversation: any) => {
			return conversation.status === 'archived';
		},
	);

	expect(result.status).toEqual('archived');
}

beforeAll(async () => {
	context.mirrorContext = {
		log: {
			warn: sandbox.stub().returns(null),
			debug: sandbox.stub().returns(null),
			info: sandbox.stub().returns(null),
			error: sandbox.stub().returns(null),
		},
		upsertElement: async (_type: any, object: any) => {
			return object;
		},
	};

	const pluginManager = new PluginManager(context.mirrorContext, {
		plugins: [ActionLibrary, DefaultPlugin, FrontPlugin],
	});

	// TS-TODO: Replace "any" type with the proper type when this fix PR is merged:
	// https://github.com/product-os/jellyfish-plugin-base/pull/320
	const integrations: any = pluginManager.getSyncIntegrations(
		context.mirrorContext,
	);
	context.sync = new Sync({
		integrations,
	});

	context.user = {
		id: uuidv4(),
		data: {
			email: 'accounts-front-dev@example.com',
			avatar: null,
		},
		name: null,
		slug: 'user-accounts-front-dev',
		type: 'user@1.0.0',
		active: true,
		markers: [],
		version: '1.0.0',
	};

	context.mirrorOptions = {
		actor: context.user.id,
		defaultUser: 'admin',
		origin: 'https://jel.ly.fish/oauth/front',
	};

	context.generateRandomSlug = (options: any) => {
		const suffix = uuidv4();
		if (options.prefix) {
			return `${options.prefix}-${suffix}`;
		}

		return suffix;
	};

	if (TOKEN) {
		context.front = new Front(TOKEN.api);
	}

	context.inboxes = environment.test.integration.front.inboxes;

	const teammates = await retryWhile429(() => {
		return context.front.inbox.listTeammates({
			inbox_id: context.inboxes[0],
		});
	});

	// Find the first available teammate for the tests
	const teammate = _.find(teammates._results, {
		is_available: true,
	});
	if (!teammate) {
		throw new Error(`No available teammate for inbox ${context.inboxes[0]}`);
	}

	context.teammate = teammate.username;

	context.getMessageSlug = () => {
		return context.generateRandomSlug({
			prefix: 'message',
		});
	};

	context.getWhisperSlug = () => {
		return context.generateRandomSlug({
			prefix: 'whisper',
		});
	};

	context.startSupportThread = async (
		title: string,
		description: string,
		inbox: string,
	) => {
		// We need a "custom" channel in order to simulate an inbound
		const channels = await retryWhile429(() => {
			return context.front.inbox.listChannels({
				inbox_id: inbox,
			});
		});

		const channel = _.find(channels._results, {
			type: 'custom',
		});
		if (!channel) {
			throw new Error('No custom channel to simulate inbound');
		}

		const inboundResult = await retryWhile429(() => {
			return context.front.message.receiveCustom({
				channel_id: channel.id,
				subject: title,
				body: description,
				sender: {
					handle: `jellytest-${uuidv4()}`,
				},
			});
		});

		const message = await retryWhile404(async () => {
			return retryWhile429(() => {
				return context.front.message.get({
					// The "receive custom" endpoint gives us a uid,
					// while all the other endpoints take an id.
					// Front supports interpreting a uid as an id
					// using this alternate notation.
					message_id: `alt:uid:${inboundResult.message_uid}`,
				});
			});
		});

		const remoteInbox = await retryWhile429(() => {
			return context.front.inbox.get({
				inbox_id: context.inboxes[0],
			});
		});

		const slug = context.generateRandomSlug({
			prefix: 'support-thread',
		});

		const supportThread = {
			id: uuidv4(),
			name: title,
			slug,
			tags: [],
			type: 'support-thread@1.0.0',
			active: true,
			markers: [],
			version: '1.0.0',
			data: {
				environment: 'production',
				inbox: remoteInbox.name,
				status: 'open',
				mirrors: [message._links.related.conversation],
				description,
				alertsUser: [],
				mentionsUser: [],
			},
			requires: [],
			capabilities: [],
		};

		return supportThread;
	};

	context.getFrontCommentsUntil = async (id: string, fn: any) => {
		return listResourceUntil(context.front.conversation.listComments, id, fn);
	};

	context.getFrontMessagesUntil = async (id: string, filter: any, fn: any) => {
		const results = await listResourceUntil(
			context.front.conversation.listMessages,
			id,
			(elements: any) => {
				return fn(_.filter(elements, filter));
			},
		);

		return _.filter(results, filter);
	};

	context.constructEvent = ({ type, actor, target, message }) => {
		return {
			id: uuidv4(),
			data: {
				actor,
				target,
				payload: {
					message,
				},
				timestamp: new Date().toISOString(),
			},
			name: null,
			slug:
				type === 'message'
					? context.getMessageSlug()
					: context.getWhisperSlug(),
			type: `${type}@1.0.0`,
			active: true,
			version: '1.0.0',
		};
	};
});

afterEach(() => {
	sandbox.restore();
});

// Skip all tests if there is no Front token
const jestTest =
	_.some(_.values(TOKEN), _.isEmpty) || environment.test.integration.skip
		? test.skip
		: test;

jestTest('should be able to comment using a complex code', async () => {
	await testMirroringOfComment(context, {
		message:
			"One last piece of the puzzle is to get the image url to pull. To get that you can run this from the browser console or sdk. \n\n`(await sdk.pine.get({ resource: 'release', id: <release-id>, options: { $expand: { image__is_part_of__release: { $expand: { image: { $select: ['is_stored_at__image_location'] } } }} } })).image__is_part_of__release.map(({ image }) => image[0].is_stored_at__image_location )`\n",
	});
});

jestTest('should be able to comment using triple backticks', async () => {
	await testMirroringOfComment(context, {
		message: '```Foo\nBar```',
	});
});

jestTest('should be able to comment using brackets', async () => {
	await testMirroringOfComment(context, {
		message: 'Hello <world> foo <bar>',
	});
});

jestTest('should be able to reply to a moved inbound message', async () => {
	const supportThread = await context.startSupportThread(
		`My Issue ${uuidv4()}`,
		`Foo Bar ${uuidv4()}`,
		context.inboxes[0],
	);

	const conversationId = _.last(supportThread.data.mirrors[0].split('/'));

	await retryWhile429(() => {
		return context.front.conversation.update({
			conversation_id: conversationId,
			inbox_id: context.inboxes[1],
		});
	});

	const message = 'Message in another inbox';

	const messageCard = context.constructEvent({
		actor: context.mirrorOptions.actor,
		target: supportThread.id,
		message,
		type: 'message',
	});

	const getElementById = sandbox
		.stub()
		.onCall(0)
		.resolves(supportThread)
		.onCall(1)
		.resolves(context.user);

	const localContext = {
		...context.mirrorContext,
		getElementById,
	};

	const [syncedMessageCard] = await context.sync.mirror(
		'front',
		TOKEN,
		messageCard,
		localContext,
		context.mirrorOptions,
	);

	expect(syncedMessageCard.data.payload.message).toEqual(message);
	expect(syncedMessageCard.data.mirrors[0]).toBeTruthy();

	const messages = await context.getFrontMessagesUntil(
		conversationId,
		{
			is_draft: false,
		},
		(elements: any) => {
			return elements.length > 1;
		},
	);

	expect(messages.length).toEqual(2);

	// Verify that the messages returned contain the expected value
	expect(messages[0].body).toEqual(`<p>${message}</p>\n`);
});

jestTest('should be able to close an inbound message', async () => {
	await testArchivingOfThread(context, {
		status: 'closed',
	});
});

jestTest('should be able to archive an inbound message', async () => {
	await testArchivingOfThread(context, {
		status: 'archived',
	});
});
