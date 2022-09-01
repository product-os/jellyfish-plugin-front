import { JellyfishError } from '@balena/jellyfish-worker';

export class RetriesExhaustedError extends Error implements JellyfishError {
	expected: boolean = false;
}
