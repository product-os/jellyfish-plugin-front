import { RetriesExhaustedError } from '../errors';

/**
 * Execute `fn`, retrying it if a QueryTimeout error occurs
 * `fn` must be idempotent
 *
 * @param context any
 * @param fn
 * @param retries max retries
 * @returns
 */
async function handleQueryTimeout(
	context: any,
	fn: any,
	retries = 100,
	delay = 2000,
): Promise<any> {
	try {
		return await fn();
	} catch (error: any) {
		if (isRetryAllowed(error)) {
			if (retries > 0) {
				context.log.warn(
					`Front.handleQueryTimeout retrying because ${error.message} in ${delay}ms. Retries remaining: ${retries}`,
				);

				await new Promise((resolve) => {
					setTimeout(resolve, delay);
				});
				return await handleQueryTimeout(context, fn, retries - 1, delay);
			} else {
				const msg = `Front.handleQueryTimeout retries exhausted! error message ${error.message}`;
				context.log.error(msg, {
					error,
				});
				throw new RetriesExhaustedError(error);
			}
		}
		throw error;
	}
}

function isRetryAllowed(error: Error): boolean {
	return (
		(error.name === 'Error' && error.message === 'Query read timeout') ||
		// using error.name instead of error instanceof JellyfishDatabaseTimeoutError
		// because the error is not exported from the worker, only from autumndb
		// TODO worker should re-export OR provide it's own error
		error.name === 'JellyfishDatabaseTimeoutError'
	);
}

const DEFAULT_OPTIONS = {
	retries: 5,
	delay: 2000,
};

/**
 * Wraps a context, making some operations retry if there's a retryable error
 * @param context
 * @param options
 * @returns
 */
export function retryableContext(
	context: any,
	options: { retries: number; delay: number } = DEFAULT_OPTIONS,
) {
	return {
		...context,
		getActorId: async (...args) => {
			return handleQueryTimeout(
				context,
				async () => context.getActorId(...args),
				options.retries,
				options.delay,
			);
		},
		getElementById: async (...args) => {
			return handleQueryTimeout(
				context,
				async () => context.getElementById(...args),
				options.retries,
				options.delay,
			);
		},
		getElementByMirrorIds: async (...args) => {
			return handleQueryTimeout(
				context,
				async () => context.getElementByMirrorIds(...args),
				options.retries,
				options.delay,
			);
		},
	};
}
