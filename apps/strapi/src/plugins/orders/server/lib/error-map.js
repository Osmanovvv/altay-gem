'use strict';

const BY_CODE = {
  ORDER_NOT_FISCALIZED: 'Сначала отсканируйте коды и выбейте чек — потом выдача',
  ORDER_FISCALIZED: 'Чек уже выбит — отмена только после чека возврата в ЮKassa',
  ORDER_TRANSITION_FORBIDDEN: 'Действие недоступно для текущего статуса — обновите страницу',
  ORDERS_NOT_CONFIGURED: 'Раздел не настроен: нет доступа к серверу заказов',
  ORDERS_TIMEOUT: 'Сервер заказов не ответил. Повторите',
};

function humanError(e) {
  if (e && e.code && BY_CODE[e.code]) return BY_CODE[e.code];
  if (e && typeof e.message === 'string' && e.message.trim()) return e.message;
  return 'Не удалось связаться с сервером заказов. Повторите';
}

module.exports = { humanError };
