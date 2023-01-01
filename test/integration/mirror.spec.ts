import { defaultEnvironment } from '@balena/jellyfish-environment';
import { testUtils } from '@balena/jellyfish-worker';
import { strict as assert } from 'assert';
import type { AutumnDBSession } from 'autumndb';
import Bluebird from 'bluebird';
import { Conversation, Front } from 'front-sdk';
import _ from 'lodash';
import { randomUUID } from 'node:crypto';
import { frontPlugin } from '../../lib';

let ctx: testUtils.TestContext;
const inboxes = defaultEnvironment.test.integration.front.inboxes;
const front = new Front(defaultEnvironment.integration.front.api);
let channel: any = {};
let remoteInbox: any = {};
let user: any = {};
let session: AutumnDBSession;

const retry = async (fn: any, times = 5, delay = 500): Promise<any> => {
	while (times > 0) {
		try {
			return await fn();
		} catch (error: any) {
			times--;
			await Bluebird.delay(delay);
		}
	}
	throw new Error('Ran out of attempts');
};

beforeAll(async () => {
	ctx = await testUtils.newContext({
		plugins: [frontPlugin()],
	});

	channel = await getChannel();
	remoteInbox = await getInbox();
	const teammate = await getTeammate();
	user = await ctx.createUser(teammate.replace(/_/g, '-'));
	session = { actor: user };
});

afterAll(() => {
	return testUtils.destroyContext(ctx);
});

// Because Front might take a while to process message creation requests.
// See: https://dev.frontapp.com/#receive-custom-message
async function retryWhile404(fn: any, times = 5): Promise<any> {
	try {
		return await fn();
	} catch (error: any) {
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
	} catch (error: any) {
		if (error.name === 'FrontError' && error.status === 429 && times > 0) {
			const delay =
				_.parseInt(_.first(error.message.match(/(\d+)/)) || '') || 2000;
			await Bluebird.delay(delay);
			return retryWhile429(fn, times - 1);
		}

		throw error;
	}
}

const getChannel = async () => {
	// We need a "custom" channel in order to simulate an inbound
	const channels = await retryWhile429(() => {
		return front.inbox.listChannels({
			inbox_id: inboxes[0],
		});
	});
	const result = _.find(channels._results, {
		type: 'custom',
	});
	if (!result) {
		throw new Error('No custom channel to simulate inbound');
	}
	return result;
};

const getTeammate = async () => {
	const teammates = await retryWhile429(() => {
		return front.inbox.listTeammates({
			inbox_id: inboxes[0],
		});
	});
	const testTeammate = _.find(teammates._results, {
		is_available: true,
	});
	if (!testTeammate) {
		throw new Error(`No available teammate for inbox ${inboxes[0]}`);
	}
	return testTeammate.username;
};

const getInbox = async () => {
	const inbox = await retryWhile429(() => {
		return front.inbox.get({
			inbox_id: inboxes[0],
		});
	});
	return inbox;
};

async function createThread(
	title: string,
	description: string,
	type: 'support-thread' | 'sales-thread' = 'support-thread',
): Promise<any> {
	const inboundResult = await retryWhile429(() => {
		return front.message.receiveCustom({
			channel_id: channel.id,
			subject: title,
			body: description,
			sender: {
				handle: `jellytest-${randomUUID()}`,
			},
		});
	});

	// Add a small delay for the message to become available from the Front API
	// This means we spend less time loop in `retryWhile404` and reduces API requests
	await Bluebird.delay(1000);

	const message = await retryWhile404(async () => {
		return retryWhile429(() => {
			return front.message.get({
				// The "receive custom" endpoint gives us a uid,
				// while all the other endpoints take an id.
				// Front supports interpreting a uid as an id
				// using this alternate notation.
				message_id: `alt:uid:${inboundResult.message_uid}`,
			});
		});
	});

	const thread = ctx.createContract(user.id, session, `${type}@1.0.0`, title, {
		environment: 'production',
		inbox: remoteInbox.name,
		status: 'open',
		mirrors: [message._links.related.conversation],
		description,
		alertsUser: [],
		mentionsUser: [],
	});

	return thread;
}

describe('mirror', () => {
	test('should mirror support thread status', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
		);
		const id = _.last(supportThread.data.mirrors[0].split('/')) as string;

		// Update status to closed
		await ctx.worker.patchCard(
			ctx.logContext,
			session,
			ctx.worker.typeContracts[supportThread.type],
			{
				attachEvents: true,
				actor: user.id,
			},
			supportThread,
			[
				{
					op: 'replace',
					path: '/data/status',
					value: 'closed',
				},
			],
		);
		await ctx.flushAll(session);

		// Check that the remote converstion status has updated
		await ctx.retry(
			() => {
				return retryWhile429(() => {
					return front.conversation.get({
						conversation_id: id,
					});
				});
			},
			(cnv: Conversation) => {
				return cnv.status === 'archived';
			},
		);

		// Check that it remains closed after a while
		await Bluebird.delay(5000);
		await ctx.retry(
			() => {
				return retryWhile429(() => {
					return front.conversation.get({
						conversation_id: id,
					});
				});
			},
			(cnv: Conversation) => {
				return cnv.status === 'archived';
			},
		);

		// Check that the support thread is still closed
		const threadAfter = await ctx.kernel.getContractById(
			ctx.logContext,
			ctx.session,
			supportThread.id,
		);
		expect(threadAfter!.active).toBe(true);
		expect(threadAfter!.data.status).toEqual('closed');
	});

	test('should mirror whisper on insert support threads', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
		);

		const body = randomUUID();
		const whisper: any = await ctx.createWhisper(
			user.id,
			session,
			supportThread,
			body,
		);
		assert(whisper !== null);

		// Give a small delay for the comment to become available on Front's API
		await Bluebird.delay(1000);

		// Retrieve the comment from Front's API using the mirror ID
		const comment = await retryWhile404(async () => {
			return retryWhile429(() => {
				return front.comment.get({
					comment_id: whisper.data.mirrors[0].split('/').pop(),
				});
			});
		});

		// Double check that it's the same comment body
		expect(comment.body).toEqual(body);
	});

	test('should mirror message insert on support threads', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
		);

		await Bluebird.delay(5000);

		const body = randomUUID();
		const message: any = await ctx.createMessage(
			user.id,
			session,
			supportThread,
			body,
		);
		assert(message !== null);

		// Give a small delay for the comment to become available on Front's API
		await Bluebird.delay(5000);

		// Retrieve the comment from Front's API using the mirror ID
		const frontMessage = await retryWhile404(async () => {
			return retryWhile429(() => {
				return front.message.get({
					message_id: message.data.mirrors[0].split('/').pop(),
				});
			});
		});
		expect(frontMessage.text).toEqual(body);
	});

	test('should be able to tag an unassigned conversation', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
		);
		const id = _.last((supportThread.data as any).mirrors[0].split('/'));

		await retryWhile429(() => {
			return front.conversation.update({
				conversation_id: id as string,
				tags: [],
				assignee_id: undefined,
			});
		});

		await ctx.worker.patchCard(
			ctx.logContext,
			session,
			ctx.worker.typeContracts[supportThread.type],
			{
				attachEvents: true,
				actor: user.id,
			},
			supportThread,
			[
				{
					op: 'replace',
					path: '/tags',
					value: ['foo'],
				},
			],
		);
		await ctx.flushAll(session);

		const result = await ctx.retry(
			() => {
				return retryWhile429(() => {
					return front.conversation.get({
						conversation_id: id as string,
					});
				});
			},
			(conversation: Conversation) => {
				return conversation.tags.length > 0;
			},
		);

		expect(_.map(result.tags, 'name')).toEqual(['foo']);
	});

	test('should be able to comment using a complex code', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
		);

		const body =
			"One last piece of the puzzle is to get the image url to pull. To get that you can run this from the browser console or sdk. \n\n`(await sdk.pine.get({ resource: 'release', id: <release-id>, options: { $expand: { image__is_part_of__release: { $expand: { image: { $select: ['is_stored_at__image_location'] } } }} } })).image__is_part_of__release.map(({ image }) => image[0].is_stored_at__image_location )`\n";
		const whisper: any = await ctx.createWhisper(
			user.id,
			session,
			supportThread,
			body,
		);
		assert(whisper !== null);

		// Give a small delay for the comment to become available on Front's API
		await Bluebird.delay(1000);

		// Retrieve the comment from Front's API using the mirror ID
		const comment = await retryWhile404(async () => {
			return retryWhile429(() => {
				return front.comment.get({
					comment_id: whisper.data.mirrors[0].split('/').pop(),
				});
			});
		});

		// Double check that it's the same comment body
		expect(comment.body).toEqual(body);
	});

	test('should be able to comment using triple backticks', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
		);

		const body = '```Foo\nBar```';
		const whisper: any = await ctx.createWhisper(
			user.id,
			session,
			supportThread,
			body,
		);
		assert(whisper !== null);

		// Give a small delay for the comment to become available on Front's API
		await Bluebird.delay(1000);

		// Retrieve the comment from Front's API using the mirror ID
		const comment = await retryWhile404(async () => {
			return retryWhile429(() => {
				return front.comment.get({
					comment_id: whisper.data.mirrors[0].split('/').pop(),
				});
			});
		});

		// Double check that it's the same comment body
		expect(comment.body).toEqual(body);
	});

	test('should be able to comment using brackets', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
		);

		const body = 'Hello <world> foo <bar>';
		const whisper: any = await ctx.createWhisper(
			user.id,
			session,
			supportThread,
			body,
		);
		assert(whisper !== null);

		// Give a small delay for the comment to become available on Front's API
		await Bluebird.delay(1000);

		// Retrieve the comment from Front's API using the mirror ID
		const comment = await retryWhile404(async () => {
			return retryWhile429(() => {
				return front.comment.get({
					comment_id: whisper.data.mirrors[0].split('/').pop(),
				});
			});
		});

		// Double check that it's the same comment body
		expect(comment.body).toEqual(body);
	});

	test('should be able to close an inbound message', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
		);

		// Update status to closed
		await ctx.worker.patchCard(
			ctx.logContext,
			session,
			ctx.worker.typeContracts[supportThread.type],
			{
				attachEvents: true,
				actor: user.id,
			},
			supportThread,
			[
				{
					op: 'replace',
					path: '/data/status',
					value: 'closed',
				},
			],
		);
		await ctx.flushAll(session);

		// Check that the remove conversation status has updated
		const result = await ctx.retry(
			() => {
				return retryWhile429(() => {
					return front.conversation.get({
						conversation_id: _.last(
							supportThread.data.mirrors[0].split('/'),
						) as string,
					});
				});
			},
			(conversation: any) => {
				return conversation.status === 'archived';
			},
		);

		expect(result.status).toEqual('archived');
	});

	test('should be able to archive an inbound message', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
		);

		// Update status to closed
		await ctx.worker.patchCard(
			ctx.logContext,
			session,
			ctx.worker.typeContracts[supportThread.type],
			{
				attachEvents: true,
				actor: user.id,
			},
			supportThread,
			[
				{
					op: 'replace',
					path: '/data/status',
					value: 'archived',
				},
			],
		);
		await ctx.flushAll(session);

		// Check that the remove conversation status has updated
		const result = await ctx.retry(
			() => {
				return retryWhile429(() => {
					return front.conversation.get({
						conversation_id: _.last(
							supportThread.data.mirrors[0].split('/'),
						) as string,
					});
				});
			},
			(conversation: any) => {
				return conversation.status === 'archived';
			},
		);

		expect(result.status).toEqual('archived');
	});

	test('should be able to reply to a moved inbound message', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
		);
		const conversationId = _.last(
			supportThread.data.mirrors[0].split('/'),
		) as string;

		// Some delays here to let Front catch up with the thread
		await Bluebird.delay(5000);

		// Move conversation to a different inbox
		await retryWhile429(() => {
			return front.conversation.update({
				conversation_id: conversationId,
				inbox_id: inboxes[1],
			});
		});

		await Bluebird.delay(5000);

		// Add a new message to the thread
		const message = 'Message in another inbox';
		await ctx.createMessage(user.id, session, supportThread, message);

		// Check that the new message was synced to the moved conversation
		const messages = await retry(
			async () => {
				const msgs = await front.conversation.listMessages({
					conversation_id: conversationId,
				});
				if (msgs._results.length === 2) {
					return msgs;
				}

				throw new Error('No messages found');
			},
			20,
			2000,
		);
		expect(messages._results[0].body).toEqual(`<p>${message}</p>\n`);
	});

	test('should be able to comment on a sales thread', async () => {
		const supportThread = await createThread(
			`My Issue ${randomUUID()}`,
			`Foo Bar ${randomUUID()}`,
			'sales-thread',
		);

		const body = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. ${randomUUID()}`;
		const whisper: any = await ctx.createWhisper(
			user.id,
			session,
			supportThread,
			body,
		);
		assert(whisper !== null);

		// Give a small delay for the comment to become available on Front's API
		await Bluebird.delay(1000);

		// Retrieve the comment from Front's API using the mirror ID
		const comment = await retryWhile404(async () => {
			return retryWhile429(() => {
				return front.comment.get({
					comment_id: whisper.data.mirrors[0].split('/').pop(),
				});
			});
		});

		// Double check that it's the same comment body
		expect(comment.body).toEqual(body);
	});
});
