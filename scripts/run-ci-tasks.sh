#!/usr/bin/env bash

# Set necessary environment variables
export INTEGRATION_FRONT_TOKEN=$(cat /run/secrets/integration_front_token)
export INTEGRATION_INTERCOM_TOKEN=$(cat /run/secrets/integration_intercom_token)

# Run tasks
scripts/delete-test-conversations.js || true
npm run test:integration
