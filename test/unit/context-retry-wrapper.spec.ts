import { ContextRetryWrapper } from '../../lib/integrations/context-retry-wrapper';

describe('ContextRetryWrapper', () => {
	const context = {
		getActorId: async () => {
			throw new Error('NON_RETRY');
		},
		getElementById: async () => {
			throw new Error('Query read timeout');
		},
		getElementByMirrorIds: async (args) => {
			return args;
		},
		log: {
			warn: console.warn,
			error: console.error,
			info: console.info,
		},
	};
	const options = { retries: 5, delay: 100 };
	const wrapper = new ContextRetryWrapper(context, options);
	test('should fail immediately with a non-retryable error', async () => {
		const now = new Date().valueOf();
		try {
			await wrapper.getActorId('x');
		} catch (error: any) {
			const after = new Date().valueOf();
			expect(error.message).toBe('NON_RETRY');
			expect(after - now).toBeLessThan(options.delay);
		}
	});

	test('should fail after retrying with a retryable error', async () => {
		const now = new Date().valueOf();
		try {
			await wrapper.getElementById('x');
		} catch (error: any) {
			const after = new Date().valueOf();
			expect(error.message).toBe('Query read timeout');
			expect(after - now).toBeGreaterThanOrEqual(
				options.delay * options.retries,
			);
			expect(after - now).toBeLessThan(options.delay * options.retries * 2);
		}
	});

	test('should not fail if no error', async () => {
		expect(await wrapper.getElementByMirrorIds('x')).toBe('x');
	});
});
