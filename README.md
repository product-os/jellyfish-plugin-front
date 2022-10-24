# Jellyfish Front Plugin

Provides a sync integration for Front.

# Usage

Below is an example how to use this library:

```typescript
import { frontPlugin } from '@balena/jellyfish-plugin-front';
import { PluginManager } from '@balena/jellyfish-worker';

// Load contracts from this plugin
const pluginManager = new PluginManager([frontPlugin()]);
const contracts = pluginManager.getCards();
console.dir(contracts);
```

# Documentation

Visit the website for complete documentation: https://product-os.github.io/jellyfish-plugin-front

# Testing

Unit tests can be easily run with the command `npm test`.

You can run integration tests locally against Postgres and Redis instances running in `docker-compose`:
```bash
git submodule update --init
git secret reveal -f
npm run compose
export INTEGRATION_FRONT_TOKEN=$(cat .balena/secrets/integration_front_token)
export INTEGRATION_INTERCOM_TOKEN=$(cat .balena/secrets/integration_intercom_token)
REDIS_HOST=localhost POSTGRES_HOST=localhost npm run test:integration
```

You can also access these Postgres and Redis instances:
```bash
PGPASSWORD=docker psql -hlocalhost -Udocker
redis-cli -h localhost
```
