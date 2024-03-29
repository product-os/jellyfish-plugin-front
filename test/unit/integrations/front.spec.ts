import { defaultEnvironment } from '@balena/jellyfish-environment';
import { PluginManager } from '@balena/jellyfish-worker';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import _ from 'lodash';
import nock from 'nock';
import { randomUUID } from 'node:crypto';
import os from 'os';
import path from 'path';
import { frontPlugin } from '../../../lib';
import { FrontIntegration } from '../../../lib/integrations/front';
import { getMessageText } from '../../../lib/integrations/front-integration-utils';

const pluginManager = new PluginManager([frontPlugin()]);
const frontIntegration = pluginManager.getSyncIntegrations().front;

const context: any = {
	id: 'jellyfish-plugin-front-test',
};

beforeAll(() => {
	context.file = {
		slug: randomUUID(),
		path: path.join(os.tmpdir(), `${randomUUID()}.txt`),
		content: randomUUID(),
	};
	fs.writeFileSync(context.file.path, context.file.content);
});

afterAll(() => {
	fs.unlinkSync(context.file.path);
});

describe('isEventValid()', () => {
	test('should return true given anything', async () => {
		const result = frontIntegration.isEventValid(context, '....', {}, context);
		expect(result).toBe(true);
	});
});

describe('getMessageText()', () => {
	test('should parse a message with attachments and no text nor body', async () => {
		const comment = {
			_links: {
				self: 'https://resinio.api.frontapp.com/comments/com_1d9tXXX',
				related: {
					conversation:
						'https://resinio.api.frontapp.com/conversations/cnv_csr9XXX',
					mentions:
						'https://resinio.api.frontapp.com/comments/com_1d9tXXX/mentions',
				},
			},
			id: 'com_1d9tXXX',
			body: '',
			posted_at: 1660635848.557,
			author: {
				_links: {
					self: 'https://resinio.api.frontapp.com/teammates/tea_33XXX',
					related: {
						inboxes:
							'https://resinio.api.frontapp.com/teammates/tea_33XXX/inboxes',
						conversations:
							'https://resinio.api.frontapp.com/teammates/tea_33XXX/conversations',
					},
				},
				id: 'tea_33XXX',
				email: 'XXX.YYY@balena.io',
				username: 'XXXYYY',
				first_name: 'XXX',
				last_name: 'YYY',
				is_admin: true,
				is_available: true,
				is_blocked: false,
				custom_fields: {},
			},
			attachments: [
				{
					id: 'fil_16lrlxxx',
					url: 'https://resinio.api.frontapp.com/download/fil_16lrlxxx',
					filename: 'image.png',
					content_type: 'image/png',
					size: 186861,
					metadata: {
						is_inline: false,
					},
				},
			],
		};
		const result = getMessageText(comment);
		expect(result).toBe('');
	});
});

// Skip non-nocked test by default locally
const jestTest =
	_.some(_.values(defaultEnvironment.integration.front), _.isEmpty) ||
	defaultEnvironment.test.integration.skip
		? test.skip
		: test;

test('getFile() should download file (nock)', async () => {
	const options = {
		token: {
			api: randomUUID(),
		},
	};
	const instance = new FrontIntegration(options);

	nock('https://api2.frontapp.com', {
		reqheaders: {
			Authorization: `Bearer ${options.token.api}`,
		},
	})
		.get(`/download/${context.file.slug}`)
		.reply(200, context.file.content);

	const result = await instance.getFile(context.file.slug);
	expect(result.toString()).toEqual(context.file.content);

	nock.cleanAll();
});

jestTest('getFile() should download file', async () => {
	const options = {
		token: defaultEnvironment.integration.front,
	};
	const instance = new FrontIntegration(options);

	// Get test channel
	const channels = await axios.get('https://api2.frontapp.com/channels', {
		headers: {
			Authorization: `Bearer ${options.token.api}`,
			Accept: 'application/json',
		},
	});

	// eslint-disable-next-line no-underscore-dangle
	const channel = _.find((channels.data as any)._results, {
		name: 'Test Channel',
	});

	// Upload attachment with a message
	const form = new FormData();
	form.append('subject', 'attachment test');
	form.append('to[0]', 'test@foo.bar');
	form.append('sender_name', 'test');
	form.append('body', '<p>Test message body</p>');
	form.append('attachments[0]', fs.createReadStream(context.file.path));
	const message = await axios.post<any>(
		`https://api2.frontapp.com/channels/${channel.id}/messages`,
		form,
		{
			headers: Object.assign({}, form.getHeaders(), {
				Authorization: `Bearer ${options.token.api}`,
			}),
		},
	);

	// Download attachment
	const url = message.data.attachments[0].url;
	const fileSlug = url.substring(url.lastIndexOf('/') + 1);
	const download = await instance.getFile(fileSlug);
	expect(download.toString()).toEqual(context.file.content);
});
