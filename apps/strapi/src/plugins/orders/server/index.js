'use strict';

module.exports = {
  routes: {
    admin: {
      type: 'admin',
      routes: [
        { method: 'GET', path: '/ping', handler: 'bridge.ping', config: { policies: [] } },
      ],
    },
  },
  controllers: {
    bridge: {
      async ping(ctx) {
        ctx.body = { ok: true };
      },
    },
  },
};
