#!/usr/bin/env bash

# Run tasks
scripts/delete-test-conversations.js || true
npm run test:integration
