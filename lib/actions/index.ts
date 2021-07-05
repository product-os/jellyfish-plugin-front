/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import type { ActionFile } from '@balena/jellyfish-plugin-base';
import { actionIntegrationFrontMirrorEvent } from './action-integration-front-mirror-event';

export const actions: ActionFile[] = [actionIntegrationFrontMirrorEvent];
