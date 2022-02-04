import type { Contract } from '@balena/jellyfish-types/build/core';
import { WorkerContext } from '@balena/jellyfish-worker';
import isArray from 'lodash/isArray';
import { v4 as uuidv4 } from 'uuid';
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
		id: uuidv4(),
		name: uuidv4(),
		slug: type === 'type' ? slug : `${type}-${uuidv4()}`,
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

/**
 * @summary Generate and return an action request object
 * @function
 *
 * @param context - execution context
 * @param requestArguments - optional request arguments
 * @returns action request object
 */
function makeRequest(args = {}): any {
	return {
		action: {
			id: uuidv4(),
			name: uuidv4(),
			slug: `action-${uuidv4()}`,
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
		card: uuidv4(),
		actor: uuidv4(),
		context: { id: uuidv4() },
		timestamp: new Date().toISOString(),
		epoch: new Date().toISOString(),
		arguments: args,
		originator: uuidv4(),
	};
}

const context: any = {
	getCardById: () => {
		return {
			id: uuidv4(),
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
			`test-${uuidv4()}`,
			context as WorkerContext,
			makeContract('user'),
			makeRequest(),
		);
		if (isArray(result)) {
			expect(Object.keys(result[0])).toEqual(['id', 'type', 'version', 'slug']);
		}
	});
});
