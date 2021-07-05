/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import type {
	ActionRequestData,
	Context,
	Contract,
} from '@balena/jellyfish-types/build/core';
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
 * @summary Generate and return a message contract
 * @function
 * @param context - execution context
 * @param data - optional contract data object
 * @returns message contract
 */
function makeMessage(ctx: Context, data = {}): Contract {
	return makeContract(
		'message',
		Object.assign(
			{},
			{
				actor: ctx.actor.id,
				payload: {
					message: uuidv4(),
				},
				timestamp: new Date().toISOString(),
			},
			data,
		),
	);
}

/**
 * @summary Generate and return an action request object
 * @function
 *
 * @param context - execution context
 * @param requestArguments - optional request arguments
 * @returns action request object
 */
function makeRequest(ctx: Context, requestArguments = {}): ActionRequestData {
	return {
		context: {
			id: `TEST-${uuidv4()}`,
		},
		timestamp: new Date().toISOString(),
		actor: ctx.actor.id,
		originator: uuidv4(),
		arguments: requestArguments,
		epoch: 1,
		input: {
			id: uuidv4(),
		},
		action: 'test',
	};
}

const context: Context = {
	id: `test-${uuidv4()}`,
	session: uuidv4(),
	actor: {
		id: uuidv4(),
	},
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
			context.session,
			context,
			makeMessage(context),
			makeRequest(context),
		);
		if (isArray(result)) {
			expect(Object.keys(result[0])).toEqual(['id', 'type', 'version', 'slug']);
		}
	});
});
