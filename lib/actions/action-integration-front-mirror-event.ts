import { ActionDefinition, mirror } from '@balena/jellyfish-worker';

const handler: ActionDefinition['handler'] = async (
	session,
	context,
	contract,
	request,
) => {
	return mirror('front', session, context, contract, request);
};

export const actionIntegrationFrontMirrorEvent: ActionDefinition = {
	handler,
	contract: {
		slug: 'action-integration-front-mirror-event',
		type: 'action@1.0.0',
		version: '1.0.0',
		data: {
			filter: {
				type: 'object',
				required: ['type'],
				properties: {
					type: {
						type: 'string',
						enum: ['support-thread@1.0.0', 'message@1.0.0', 'whisper@1.0.0'],
					},
				},
			},
			arguments: {},
		},
	},
};
