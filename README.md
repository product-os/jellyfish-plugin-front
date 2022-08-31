# Jellyfish Front Plugin

Provides a sync integration for Front.

# Usage

Below is an example how to use this library:

```typescript
import { defaultPlugin } from '@balena/jellyfish-plugin-default';
import { frontPlugin } from '@balena/jellyfish-plugin-front';
import { productOsPlugin } from '@balena/jellyfish-plugin-product-os';
import { PluginManager } from '@balena/jellyfish-worker';

// Load contracts from this plugin
const pluginManager = new PluginManager([defaultPlugin(), productOsPlugin(), frontPlugin()]);
const contracts = pluginManager.getCards();
console.dir(contracts);
```

# Documentation

[![Publish Documentation](https://github.com/product-os/jellyfish-plugin-front/actions/workflows/publish-docs.yml/badge.svg)](https://github.com/product-os/jellyfish-plugin-front/actions/workflows/publish-docs.yml)

Visit the website for complete documentation: https://product-os.github.io/jellyfish-plugin-front

# Testing

Unit tests can be easily run with the command `npm test`.

The integration tests require Postgres and Redis instances. The simplest way to run the tests locally is with `docker-compose`.
```
git submodule update --init
git secret reveal -f
npm run test:compose
```

You can also run tests locally against Postgres and Redis instances running in `docker-compose`:
```
git submodule update --init
git secret reveal -f
npm run compose
export INTEGRATION_FRONT_TOKEN=$(cat .balena/secrets/integration_front_token)
export INTEGRATION_INTERCOM_TOKEN=$(cat .balena/secrets/integration_intercom_token)
REDIS_HOST=localhost POSTGRES_HOST=localhost npm run test:integration
```

You can also access these Postgres and Redis instances:
```
PGPASSWORD=docker psql -hlocalhost -Udocker
redis-cli -h localhost
```
