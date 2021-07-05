/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { defaultEnvironment } from '@balena/jellyfish-environment';
import * as errors from '@balena/jellyfish-sync/build/errors';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import _ from 'lodash';
import nock from 'nock';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// tslint:disable-next-line: no-var-requires
const Front = require('../../../lib/integrations/front');

const context: any = {
	id: 'jellyfish-plugin-front-test',
};

beforeAll(() => {
	context.file = {
		slug: uuidv4(),
		path: path.join(os.tmpdir(), `${uuidv4()}.txt`),
		content: uuidv4(),
	};
	fs.writeFileSync(context.file.path, context.file.content);
});

afterAll(() => {
	fs.unlinkSync(context.file.path);
});

describe('isEventValid()', () => {
	test('should return true given anything', async () => {
		const result = Front.isEventValid({ api: 'xxxxxxx' }, '....', {}, context);
		expect(result).toBe(true);
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
			api: uuidv4(),
		},
		errors,
	};
	const instance = new Front(options);

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
		errors,
	};
	const instance = new Front(options);

	// Get test channel
	const channels = await axios.get('https://api2.frontapp.com/channels', {
		headers: {
			Authorization: `Bearer ${options.token.api}`,
			Accept: 'application/json',
		},
	});

	// eslint-disable-next-line no-underscore-dangle
	const channel = _.find(channels.data._results, {
		name: 'Test Channel',
	});

	// Upload attachment with a message
	const form = new FormData();
	form.append('subject', 'attachment test');
	form.append('to[0]', 'test@foo.bar');
	form.append('sender_name', 'test');
	form.append('body', '<p>Test message body</p>');
	form.append('attachments[0]', fs.createReadStream(context.file.path));
	const message = await axios.post(
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
