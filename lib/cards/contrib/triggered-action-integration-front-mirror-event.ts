/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import type { TriggeredActionContractDefinition } from '@balena/jellyfish-types/build/worker';

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
				anyOf: [
					{
						required: ['type'],
						properties: {
							type: {
								type: 'string',
								enum: ['message@1.0.0', 'whisper@1.0.0'],
							},
						},
					},
					{
						required: ['type', 'data'],
						properties: {
							type: {
								type: 'string',
								const: 'support-thread@1.0.0',
							},
						},
						allOf: [
							{
								properties: {
									// this needs to be specified separately, because we want to run on any changes
									// within /data
									data: {
										type: 'object',
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
				],
			},
			action: 'action-integration-front-mirror-event@1.0.0',
			target: {
				$eval: 'source.id',
			},
			arguments: {},
		},
	};
