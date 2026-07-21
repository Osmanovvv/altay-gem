import { ShoppingCart } from '@strapi/icons';

export default {
  register(app) {
    app.addMenuLink({
      to: 'plugins/orders',
      icon: ShoppingCart,
      intlLabel: { id: 'orders.menu', defaultMessage: 'Заказы' },
      // Рекомендованная форма Strapi 5: лоадер с dynamic import
      // (async () => App работает, но даёт deprecation warning в консоли).
      Component: () => import('./pages/App'),
      permissions: [],
    });
    app.registerPlugin({ id: 'orders', name: 'orders' });
  },
  bootstrap() {},
};
