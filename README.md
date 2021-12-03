# Jellyfish Front Plugin

Provides a sync integration for Front.

# Usage

Below is an example how to use this library:

```js
import { cardMixins } from '@balena/jellyfish-core';
import { FrontPlugin } from '@balena/jellyfish-plugin-front';

const plugin = new FrontPlugin();

// Load cards from this plugin, can use custom mixins
const cards = plugin.getCards(context, cardMixins);
console.dir(cards);
```

# Documentation

[![Publish Documentation](https://github.com/product-os/jellyfish-plugin-front/actions/workflows/publish-docs.yml/badge.svg)](https://github.com/product-os/jellyfish-plugin-front/actions/workflows/publish-docs.yml)

Visit the website for complete documentation: https://product-os.github.io/jellyfish-plugin-front

# Testing

Unit tests can be easily run with the command `npm test`.

The integration tests require Postgres and Redis instances. The simplest way to run the tests locally is with `docker-compose`.

```
$ git secret reveal
$ npm run test:compose
```

You can also run tests locally against Postgres and Redis instances running in `docker-compose`:
```
$ git secret reveal
$ npm run compose
$ export INTEGRATION_FRONT_TOKEN=$(cat .balena/secrets/integration_front_token)
$ export INTEGRATION_INTERCOM_TOKEN=$(cat .balena/secrets/integration_intercom_token)
$ REDIS_HOST=localhost POSTGRES_HOST=localhost npm run test:mirror
```

You can also access these Postgres and Redis instances:
```
$ PGPASSWORD=docker psql -hlocalhost -Udocker
$ redis-cli -h localhost
```
