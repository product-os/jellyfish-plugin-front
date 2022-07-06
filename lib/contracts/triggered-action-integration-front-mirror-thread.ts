import type { TriggeredActionContractDefinition } from '@balena/jellyfish-worker';

export const triggeredActionIntegrationFrontMirrorThread: TriggeredActionContractDefinition =
	{
		slug: 'triggered-action-integration-front-mirror-threads',
		type: 'triggered-action@1.0.0',
		name: 'Triggered action for Front mirrors',
		markers: [],
		data: {
			filter: {
				type: 'object',
				required: ['type', 'data'],
				properties: {
					type: {
						type: 'string',
						enum: ['support-thread@1.0.0', 'sales-thread@1.0.0'],
					},
				},
				allOf: [
					{
						properties: {
							// need to be specified separately, because we want to run on any changes
							// within these properties
							data: {
								type: 'object',
							},
							tags: {
								type: 'array',
							},
						},
					},
					{
						properties: {
							data: {
								type: 'object',
								required: ['inbox', 'mirrors'],
								properties: {
									inbox: {
										type: 'string',
										enum: [
											'S/Paid_Support',
											'D/Security',
											'Jellyfish Test Inbox',
											'Jellyfish Testfront',
										],
									},
								},
							},
						},
					},
				],
			},
			action: 'action-integration-front-mirror-event@1.0.0',
			target: {
				$eval: 'source.id',
			},
			arguments: {},
		},
	};
