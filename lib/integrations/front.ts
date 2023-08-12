import * as assert from '@balena/jellyfish-assert';
import {
	errors as workerErrors,
	Integration,
	IntegrationDefinition,
	SequenceItem,
} from '@balena/jellyfish-worker';
import axios from 'axios';
import jsonpatch from 'fast-json-patch';
import * as Intercom from 'intercom-client';
import _ from 'lodash';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import * as url from 'node:url';
import * as utils from './utils';
import * as frontUtils from './front-integration-utils';
import { retryableContext } from './context-retry-wrapper';

// TS-TODO: Use import when front-sdk is fixed
// tslint:disable: no-var-requires
const Front = require('front-sdk').Front;

const SLUG = 'front';

/**
 * @summary All the thread types we support
 * @constant
 * @private
 */
const ALL_THREAD_TYPES = [
	'sales-thread',
	'support-thread',
	'sales-thread@1.0.0',
	'support-thread@1.0.0',
	'brainstorm-topic@1.0.0',
];

const RETRIES = parseInt(process.env.FRONT_RETRIES || '60', 10);
const DELAY = parseInt(process.env.FRONT_DELAY || '5000', 10);

function getPrimaryDomain(urlString: string): string | undefined {
	const parsedUrl = url.parse(urlString);
	const host = parsedUrl.hostname;

	if (host != null) {
		// Split host into its components and reverse the array
		const hostArr = host.split('.').reverse();

		// Check if there is a TLD (top-level domain) in the first position
		if (hostArr.length > 1 && hostArr[0].length <= 3) {
			return hostArr.slice(0, 2).reverse().join('.');
		} else {
			return hostArr.slice(0, 1).reverse().join('.');
		}
	}
}

export class FrontIntegration implements Integration {
	public slug = SLUG;
	public context: any;
	public options: any;
	public front: any;
	public intercom: any;

	constructor(options: any) {
		this.options = options;
		const retryOptions = { retries: RETRIES, delay: DELAY };
		this.context = this.options.context
			? retryableContext(this.options.context, retryOptions)
			: null;
		this.front = new Front(this.options.token.api);

		if (this.options.token.intercom) {
			this.intercom = new Intercom.Client({
				tokenAuth: {
					token: this.options.token.intercom,
				},
			});
		}
	}

	public async destroy() {
		return;
	}

	public async translate(event: any): Promise<SequenceItem[]> {
		this.context.log.info('FrontIntegration.translate event:.', {
			event,
		});
		if (!this.options.token.api || !this.options.token.intercom) {
			this.context.log.info(
				'FrontIntegration.translate No token.api or not intercom token on env, returning.',
			);
			return [];
		}

		// In Front, these events can happen even before the conversation actually
		// starts, so if we process the events before the actual conversation,
		// then we will correctly detect and sync an empty conversation, which
		// makes little practical sense.
		if (event.data.payload.conversation.status === 'invisible') {
			this.context.log.info('Ignoring invisible conversation');
			return [];
		}

		const inbox = await frontUtils.getEventInbox(
			this.context,
			this.front,
			event,
		);
		const threadType = frontUtils.getThreadType(inbox);
		if (!threadType) {
			this.context.log.info('No thread type for inbox', {
				inbox,
			});

			return [];
		}

		assert.INTERNAL(
			null,
			ALL_THREAD_TYPES.includes(threadType),
			workerErrors.SyncInvalidType,
			`Invalid thread type: ${threadType} for inbox ${inbox}`,
		);

		const cards: any[] = [];

		// Get last message if possible
		const lastMsg = event.data.payload.conversation._links.related.last_message
			? await frontUtils.getLastMessageFromFront(
					this.context,
					this.front,
					event.data.payload.conversation._links.related.last_message,
			  )
			: null;

		const actor = await this.getLocalUser(event);
		assert.INTERNAL(null, actor, workerErrors.SyncNoActor, () => {
			return `No actor id for ${JSON.stringify(event)}`;
		});

		const threadActor = await this.getThreadActor(event, lastMsg);
		assert.INTERNAL(null, threadActor, workerErrors.SyncNoActor, () => {
			return `No thread actor id for ${JSON.stringify(event)}`;
		});

		const threadCard = await frontUtils.getThread(
			this.context,
			this.front,
			event,
			inbox,
			threadType,
		);
		if (!threadCard.id) {
			this.context.log.info('Creating thread', {
				slug: threadCard.slug,
			});

			cards.push({
				time: utils.getDateFromEpoch(
					event.data.payload.conversation.created_at,
				),
				actor: threadActor,
				card: _.cloneDeep(threadCard),
			});
			threadCard.id = {
				$eval: 'cards[0].id',
			};
		}

		this.context.log.info(
			'FrontIntegration.translate before getAllThreadMessages',
		);

		// Do a recap using the API
		const remoteMessages = await frontUtils.getAllThreadMessages(
			this.front,
			this.context,
			_.last(threadCard.data.mirrors[0].split('/')) || '',
		);

		this.context.log.info('Inserting remote messages', {
			count: remoteMessages.length,
		});

		for (const remoteMessage of remoteMessages) {
			const comment = await frontUtils.getMessage(
				this,
				this.front,
				this.intercom,
				cards,
				remoteMessage,
				threadCard.id,
				utils.getDateFromEpoch(event.data.payload.emitted_at),
				remoteMessages,
			);
			cards.push(
				...utils.postEvent(cards, comment, threadCard, {
					actor: comment ? comment.data.actor : null,
				}),
			);
		}

		// We still extract any message mentioned in the event itself,
		// just in case the API is not updated by the time we query
		const eventMessage = await frontUtils.getEventMessage(
			this,
			this.front,
			this.intercom,
			cards,
			event,
			threadCard,
			remoteMessages,
		);
		if (eventMessage.length > 0) {
			this.context.log.info('Inserting event message');
		}
		cards.push(...eventMessage);

		const lastMessage = await frontUtils.getConversationLastMessage(
			this,
			this.front,
			this.intercom,
			cards,
			event,
			threadCard,
			remoteMessages,
			lastMsg,
		);
		if (lastMessage.length > 0) {
			this.context.log.info('Inserting last message');
		}
		cards.push(...lastMessage);

		const date = utils.getDateFromEpoch(event.data.payload.emitted_at);
		const patch = frontUtils.getThreadPatchFromEvent(threadCard, event);
		const updatedThreadCard = _.cloneDeep(threadCard);
		jsonpatch.applyPatch(updatedThreadCard, patch);

		if (
			updatedThreadCard.data.translateDate &&
			date < new Date(updatedThreadCard.data.translateDate)
		) {
			this.context.log.info('Translate date is a future date');
			return cards;
		}

		if (_.isEqual(updatedThreadCard, threadCard)) {
			this.context.log.info('Thread card remains the same', {
				slug: threadCard.slug,
			});

			if (
				updatedThreadCard.data.translateDate &&
				date > new Date(updatedThreadCard.data.translateDate)
			) {
				if (!_.isEmpty(cards)) {
					const index = _.findLastIndex(cards, {
						card: {
							type: threadType,
						},
					});

					if (index > -1) {
						cards[index].card.data.translateDate = date.toISOString();
						return cards;
					}
				}

				patch.unshift({
					op: 'replace',
					path: '/data/translateDate',
					value: date.toISOString(),
				});
				return cards.concat([
					{
						time: date,
						actor,
						card: {
							id: updatedThreadCard.id,
							type: updatedThreadCard.type,
							patch,
						},
					},
				]);
			}

			return cards;
		}

		patch.unshift({
			op: 'replace',
			path: '/data/translateDate',
			value: date.toISOString(),
		});

		// We make a good enough approximation if we didn't know about the head
		// card, as Front won't tell us precisely when the event happened.
		const creationDate = utils.getDateFromEpoch(
			event.data.payload.conversation.created_at + 1,
		);

		return cards.concat([
			{
				time: _.isString(threadCard.id) ? date : creationDate,
				actor,
				card: {
					id: updatedThreadCard.id,
					type: updatedThreadCard.type,
					patch,
				},
			},
		]);
	}

	public async mirror(card: any, options: any): Promise<SequenceItem[]> {
		if (!this.options.token.api || !this.options.token.intercom) {
			return [];
		}

		const frontUrl = _.find(card.data.mirrors, (mirror) => {
			return getPrimaryDomain(mirror) === 'frontapp.com';
		});

		this.context.log.info('Mirroring Front', {
			url: frontUrl,
			remote: card,
		});

		if (ALL_THREAD_TYPES.includes(card.type) && frontUrl) {
			const id = _.last(frontUrl.split('/'));
			const conversation = await frontUtils.handleRateLimit(
				this.context,
				() => {
					this.context.log.info('Front API request', {
						type: 'conversation.get',
						id,
					});

					return this.front.conversation.get({
						conversation_id: id,
					});
				},
			);

			let status = 'open';
			if (conversation.status === 'deleted') {
				status = 'archived';
			}

			if (conversation.status === 'archived') {
				status = 'closed';
			}

			if (
				conversation.subject.replace(/^Re:\s/, '') !== card.name ||
				status !== card.data.status ||
				!_.isEqual(
					_.sortBy(card.tags),
					_.sortBy(_.map(conversation.tags, 'name')),
				)
			) {
				let newStatus = conversation.status;
				if (card.data.status === 'closed' || card.data.status === 'archived') {
					newStatus = 'archived';
				}
				if (card.data.status === 'open') {
					newStatus = 'open';
				}

				this.context.log.info('Updating front thread', {
					conversation: id,
					status: newStatus,
					tags: card.tags,
				});

				const updateOptions: any = {
					conversation_id: id,
					tags: card.tags,
				};

				// Oddly enough Front doesn't like `status=unassigned`,
				// or `status=assigned` and expects this instead.
				if (newStatus === 'unassigned') {
					updateOptions.assignee_id = null;
				} else if (newStatus === 'assigned') {
					updateOptions.assignee_id = conversation.assignee.id;
				} else {
					updateOptions.status = newStatus;
				}

				this.context.log.info('Updating front conversation', updateOptions);
				await frontUtils.handleRateLimit(this.context, () => {
					this.context.log.info('Front API request', {
						type: 'conversation.update',
						id,
					});

					return this.front.conversation.update(updateOptions);
				});

				return [
					{
						time: new Date(),
						actor: options.actor,
						card,
					},
				];
			}

			return [];
		}

		// Only external people may create conversations from Front
		if (ALL_THREAD_TYPES.includes(card.type) && !frontUrl) {
			return [];
		}

		const baseType = card.type.split('@')[0];
		if (baseType === 'message' || baseType === 'whisper') {
			const thread = await this.context.getElementById(card.data.target);
			if (!thread || !ALL_THREAD_TYPES.includes(thread.type)) {
				return [];
			}

			// We have no way to update Front comments or messages
			if (frontUrl) {
				return [];
			}

			const threadFrontUrl = _.find(thread.data.mirrors, (mirror) => {
				return getPrimaryDomain(mirror) === 'frontapp.com';
			});
			if (!threadFrontUrl) {
				return [];
			}

			const response = await frontUtils.handleRateLimit(this.context, () => {
				this.context.log.info('Front API request', {
					type: 'teammate.list',
				});

				return this.front.teammate.list();
			});

			const actor = await this.context.getElementById(options.actor);
			if (!actor) {
				return [];
			}

			const author = _.find(response._results, {
				// Front automatically transforms hyphens to
				// underscores in the UI
				username: actor.slug.replace(/^user-/g, '').replace(/-/g, '_'),
			});

			assert.USER(
				null,
				author,
				workerErrors.SyncExternalRequestError,
				`No Front author that corresponds to ${actor.slug}`,
			);

			card.data.mirrors = card.data.mirrors || [];

			if (baseType === 'whisper') {
				const conversation = _.last(threadFrontUrl.split('/'));
				const message = card.data.payload.message || '[Empty content]';

				this.context.log.info('Creating front whisper', {
					conversation,
					author: author.id,
					body: message,
				});

				const createResponse = await frontUtils.handleRateLimit(
					this.context,
					() => {
						this.context.log.info('Front API request', {
							type: 'comment.create',
							id: conversation,
						});

						return this.front.comment.create({
							conversation_id: conversation,
							author_id: author.id,
							body: message,
						});
					},
				);

				card.data.mirrors.push(createResponse._links.self);
			}

			if (baseType === 'message') {
				const conversation: string = _.last(threadFrontUrl.split('/')) || '';
				const message = card.data.payload.message;
				const rawhtml = marked.parse(message, {
					// Enable github flavored markdown
					gfm: true,
					breaks: true,
					headerIds: false,
				});

				const html = sanitizeHtml(rawhtml);

				this.context.log.info('Creating front message', {
					conversation,
					author: author.id,
					text: message,
					body: html,
				});

				const channel = await frontUtils.getConversationChannel(
					this.context,
					workerErrors,
					this.front,
					conversation,
					thread.data.inbox,
				);
				const createResponse = await frontUtils.handleRateLimit(
					this.context,
					() => {
						this.context.log.info('Front API request', {
							type: 'message.reply',
							id: conversation,
						});

						return this.front.message.reply({
							conversation_id: conversation,
							author_id: author.id,
							body: html,
							channel_id: channel.id,

							/*
							 * Front seems to mess up back ticks by replacing them
							 * with "<br>\n", but for some reason it doesn't mangle
							 * the data if we also pass a plain text version of the
							 * message (?)
							 */
							text: message,

							options: {
								archive: false,
							},
						});
					},
				);

				card.data.mirrors.push(createResponse._links.self);
			}

			return [
				{
					time: new Date(),
					actor: options.actor,
					card,
				},
			];
		}

		return [];
	}

	async getLocalUser(event: any) {
		if (event.data.payload.source._meta.type === 'teammate') {
			// An action done by a rule
			if (!event.data.payload.source.data) {
				return this.context.getActorId({
					handle: this.options.defaultUser,
				});
			}

			this.context.log.info('Getting actor id from payload source', {
				source: event.data.payload.source.data,
			});

			return this.context.getActorId({
				handle: event.data.payload.source.data.username,
				email: event.data.payload.source.data.email,
				name: {
					first: event.data.payload.source.data.first_name,
					last: event.data.payload.source.data.last_name,
				},
			});
		}

		// This seems to be true when there is an event caused
		// by a rule, and not by anyone in particular.
		if (
			event.data.payload.source._meta.type === 'api' ||
			event.data.payload.source._meta.type === 'gmail' ||
			event.data.payload.source._meta.type === 'reminder'
		) {
			if (
				!event.data.payload.target ||
				!event.data.payload.target.data ||
				(event.data.payload.target &&
					!event.data.payload.target.data.author &&
					!event.data.payload.target.data.recipients)
			) {
				return this.context.getActorId({
					handle: this.options.defaultUser,
				});
			}
		}

		return frontUtils.getMessageActor(
			this.context,
			this.front,
			this.intercom,
			event.data.payload.target.data,
		);
	}

	async getThreadActor(event: any, lastMessage: any) {
		if (
			event.data.payload.conversation &&
			event.data.payload.conversation.recipient
		) {
			if (
				event.data.payload.conversation.recipient._links &&
				event.data.payload.conversation.recipient._links.related
			) {
				const contactUrl =
					event.data.payload.conversation.recipient._links.related.contact;

				if (contactUrl) {
					const id = _.last(_.split(contactUrl, '/'));
					const contact = await frontUtils.getFrontContact(
						this.context,
						this.front,
						id,
					);

					if (contact) {
						const intercomData = _.find(contact.handles, {
							source: 'intercom',
						});

						if (intercomData) {
							const intercomUser = await frontUtils.getIntercomUser(
								this.context,
								this.intercom,
								intercomData.handle,
							);
							if (intercomUser) {
								this.context.log.info('Found Intercom user', intercomUser);
								const customAttributes = intercomUser.custom_attributes || {};

								return this.context.getActorId({
									handle: intercomUser.user_id,
									email: intercomUser.email,
									title: customAttributes['Account Type'],
									company: customAttributes.Company,
									country: intercomUser.location_data.country_name,
									city: intercomUser.location_data.city_name,
									name: {
										first: customAttributes['First Name'],
										last: customAttributes['Last Name'],
									},
								});
							}
						}

						if (utils.isEmail(contact.name)) {
							return this.context.getActorId({
								email: contact.name,
							});
						}

						const email = _.find(contact.handles, {
							source: 'email',
						});

						if (email && utils.isEmail(email.handle)) {
							return this.context.getActorId({
								email: email.handle,
							});
						}

						return this.context.getActorId({
							handle: contact.name,
						});
					}
				}

				if (
					event.data.payload.conversation.recipient.handle &&
					lastMessage &&
					lastMessage.type !== 'intercom'
				) {
					return this.context.getActorId({
						email: event.data.payload.conversation.recipient.handle,
					});
				}
			}

			if (
				event.data.payload.conversation.recipient.role === 'from' &&
				event.data.payload.conversation.recipient.handle &&
				!event.data.payload.conversation.recipient._links.related.contact &&
				!event.data.payload.conversation.recipient.handle.includes('@')
			) {
				const intercomUser = await frontUtils.getIntercomUser(
					this.context,
					this.intercom,
					event.data.payload.conversation.recipient.handle,
				);

				if (intercomUser) {
					this.context.log.info('Found Intercom user', intercomUser);
					const customAttributes = intercomUser.custom_attributes || {};
					return this.context.getActorId({
						handle: intercomUser.user_id,
						email: intercomUser.email,
						title: customAttributes['Account Type'],
						company: customAttributes.Company,
						country: intercomUser.location_data.country_name,
						city: intercomUser.location_data.city_name,
						name: {
							first: customAttributes['First Name'],
							last: customAttributes['Last Name'],
						},
					});
				}
			}
		}

		if (
			event.data.payload.target &&
			event.data.payload.target._meta &&
			event.data.payload.target._meta.type === 'message' &&
			event.data.payload.target.data &&
			!event.data.payload.target.data.is_inbound
		) {
			const target = _.find(event.data.payload.target.data.recipients, {
				role: 'to',
			});

			if (target) {
				const id = _.last(_.split(target._links.related.contact, '/'));
				const contact = await frontUtils.getFrontContact(
					this.context,
					this.front,
					id,
				);

				if (contact && contact.name) {
					return this.context.getActorId({
						handle: contact.name,
					});
				}
			}
		}

		// Fallback to the event actor
		return this.getLocalUser(event);
	}

	/**
	 * @summary Fetches a file from the front API and returns it as a buffer
	 * @public
	 * @function
	 *
	 * @param {String} file - The slug of the file to download
	 * @returns {Buffer}
	 */
	async getFile(file: string) {
		assert.INTERNAL(
			null,
			this.options.token.api,
			workerErrors.SyncExternalRequestError,
			'Front api token is missing',
		);

		try {
			const response = await axios.get(
				`https://api2.frontapp.com/download/${file}`,
				{
					headers: {
						Authorization: `Bearer ${this.options.token.api}`,
					},
					responseType: 'arraybuffer',
				},
			);
			return Buffer.from(response.data as string, 'utf8');
		} catch (error: any) {
			assert.USER(
				null,
				error.statusCode !== 500,
				workerErrors.SyncExternalRequestError,
				`Front crashed with ${error.statusCode} when fetching attachment ${file}`,
			);

			// Because the response is a buffer, the error is sent as a buffer as well
			if (_.isBuffer(error.error)) {
				const errorMessage = Buffer.from(error.error, 'utf8').toString();
				let parsedError: any = '';
				try {
					parsedError = JSON.parse(errorMessage);
				} catch (parseError) {
					throw new Error(`Unable to parse response payload: ${errorMessage}`);
				}

				if (parsedError._error) {
					parsedError = parsedError._error;
					let newErrorMessage = `Received error from Front API: ${parsedError.status} - ${parsedError.title}`;
					if (parsedError.message) {
						newErrorMessage = `${newErrorMessage}: ${parsedError.message}`;
					}
					throw new Error(newErrorMessage);
				} else {
					throw new Error(
						`Received unknown error response from from Front API: ${errorMessage}`,
					);
				}
			}

			// Get the original request error object
			// See https://github.com/request/request-promise
			if (_.isError(error.error)) {
				throw error.error;
			} else if (_.isError(error.cause)) {
				throw error.cause;
			}

			throw error;
		}
	}
}

export const frontIntegrationDefinition: IntegrationDefinition = {
	slug: SLUG,

	initialize: async (options) => new FrontIntegration(options),

	// Front doesn't seem to offer any webhook security mechanism
	isEventValid: _.constant(true),
};
