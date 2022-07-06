import type { TriggeredActionContractDefinition } from '@balena/jellyfish-worker';

export const triggeredActionIntegrationFrontMirrorEvent: TriggeredActionContractDefinition =
	{
		slug: 'triggered-action-integration-front-mirror-event',
		type: 'triggered-action@1.0.0',
		name: 'Triggered action for Front mirrors',
		markers: [],
		data: {
			schedule: 'sync',
			filter: {
				type: 'object',
				required: ['type'],
				properties: {
					type: {
						type: 'string',
						enum: ['message@1.0.0', 'whisper@1.0.0'],
					},
				},
				$$links: {
					'is attached to': {
						type: 'object',
						properties: {
							type: {
								enum: ['support-thread@1.0.0', 'sales-thread@1.0.0'],
							},
							data: {
								type: 'object',
								properties: {
									mirrors: {
										type: 'array',
										contains: {
											type: 'string',
											pattern: 'frontapp.com',
										},
									},
								},
							},
						},
					},
				},
			},
			action: 'action-integration-front-mirror-event@1.0.0',
			target: {
				$eval: 'source.id',
			},
			arguments: {},
		},
	};
