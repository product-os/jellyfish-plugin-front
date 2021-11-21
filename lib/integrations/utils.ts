import _ from 'lodash';

/**
 * @summary Get a date object from an epoch number
 * @function
 * @private
 *
 * @param {Number} epoch - epoch date
 * @returns {Date} date object
 */
export function getDateFromEpoch(epoch: number): Date {
	return new Date(epoch * 1000);
}

export function attachCards(
	date: any,
	fromCard: any,
	toCard: any,
	options: any,
): any {
	return {
		time: date,
		actor: options.actor,
		card: {
			slug: `link-${fromCard.slug}-is-attached-to-${toCard.slug}`,
			type: 'link@1.0.0',
			name: 'is attached to',
			data: {
				inverseName: 'has attached element',
				from: {
					id: fromCard.id,
					type: fromCard.type,
				},
				to: {
					id: toCard.id,
					type: toCard.type,
				},
			},
		},
	};
}

export function createPrefixRegExp(prefix: string): RegExp {
	const regExp = new RegExp(
		`(\\s|^)((${prefix})[a-z\\d-_\\/]+(\\.[a-z\\d-_\\/]+)*)`,
		'gmi',
	);
	return regExp;
}

export function findWordsByPrefix(prefix: string, source: string): any {
	const regExp = createPrefixRegExp(prefix);
	return _.invokeMap(_.compact(source.match(regExp)), 'trim');
}

export function getSlugsByPrefix(
	prefix: string,
	source: string,
	replacement = '',
): any {
	const words = findWordsByPrefix(prefix, source);

	return _.uniq(
		words.map((name: string) => {
			return name.trim().replace(prefix, replacement);
		}),
	);
}

export function postEvent(
	sequence: any,
	eventCard: any,
	targetCard: any,
	options: any,
): any {
	if (!eventCard) {
		return [];
	}

	const date = new Date(eventCard.data.timestamp);
	return [
		{
			time: date,
			actor: options.actor,
			card: eventCard,
		},
		attachCards(
			date,
			{
				id: {
					$eval: `cards[${sequence.length}].id`,
				},
				slug: eventCard.slug,
				type: eventCard.type,
			},
			{
				id: eventCard.data.target,
				slug: targetCard.slug,
				type: targetCard.type,
			},
			{
				actor: options.actor,
			},
		),
	];
}

export function isEmail(value: string): boolean {
	return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
}

export function getMessageMetaData(message: any): any {
	return {
		tags: findWordsByPrefix('#', message).map((tag: any) => {
			return tag.slice(1).toLowerCase();
		}),
		payload: {
			mentionsUser: getSlugsByPrefix('@', message, 'user-'),
			alertsUser: getSlugsByPrefix('!', message, 'user-'),
			mentionsGroup: getSlugsByPrefix('@@', message),
			alertsGroup: getSlugsByPrefix('!!', message),
			message,
		},
	};
}
