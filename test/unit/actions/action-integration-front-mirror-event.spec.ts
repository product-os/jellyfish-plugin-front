import type { AutumnDBSession, Contract } from 'autumndb';
import { WorkerContext } from '@balena/jellyfish-worker';
import _ from 'lodash';
import { randomUUID } from 'node:crypto';
import { actionIntegrationFrontMirrorEvent } from '../../../lib/actions/action-integration-front-mirror-event';

const handler = actionIntegrationFrontMirrorEvent.handler;

// TS-TODO: Export these common make functions from test-harness.
/**
 * @summary Create contract base skeleton
 * @function
 *
 * @param type - contract base type
 * @param data - optional contract data object
 * @param slug - optional contract slug
 * @returns contract
 */
function makeContract(type: string, data = {}, slug = ''): Contract {
	return {
		id: randomUUID(),
		name: randomUUID(),
		slug: type === 'type' ? slug : `${type}-${randomUUID()}`,
		type: `${type}@1.0.0`,
		version: '1.0.0',
		active: true,
		links: {},
		tags: [],
		markers: [],
		created_at: new Date().toISOString(),
		requires: [],
		capabilities: [],
		data,
	};
}

const mockSession: AutumnDBSession = {
	actor: makeContract('user'),
};

/**
 * @summary Generate and return an action request object
 * @function
 *
 * @param args - optional request arguments
 * @returns action request object
 */
function makeRequest(args = {}): any {
	return {
		action: {
			id: randomUUID(),
			name: randomUUID(),
			slug: `action-${randomUUID()}`,
			type: 'action@1.0.0',
			version: '1.0.0',
			active: true,
			links: {},
			tags: [],
			markers: [],
			created_at: new Date().toISOString(),
			requires: [],
			capabilities: [],
			data: {
				arguments: args,
			},
		},
		card: randomUUID(),
		actor: randomUUID(),
		context: { id: randomUUID() },
		timestamp: new Date().toISOString(),
		epoch: new Date().toISOString(),
		arguments: args,
		originator: randomUUID(),
	};
}

const context: any = {
	getCardById: () => {
		return {
			id: randomUUID(),
		};
	},
	sync: {
		mirror: (): Contract[] => {
			return [makeContract('user'), makeContract('user')];
		},
		getActionContext: () => {
			return {};
		},
	},
};

describe('action-integration-front-mirror-event', () => {
	test('should return a list of cards', async () => {
		expect.assertions(1);
		const result = await handler(
			mockSession,
			context as WorkerContext,
			makeContract('user'),
			makeRequest(),
		);
		if (_.isArray(result)) {
			expect(Object.keys(result[0])).toEqual(['id', 'type', 'version', 'slug']);
		}
	});
});
