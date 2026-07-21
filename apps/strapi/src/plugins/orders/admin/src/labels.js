export const STATUS_LABEL = {
  new: 'Новый', awaiting_payment: 'Ожидает оплаты', paid: 'Оплачен',
  assembling: 'Собирается', ready_for_pickup: 'Готов к выдаче',
  shipped: 'Передан в доставку', completed: 'Выполнен', cancelled: 'Отменён',
};
export const STATUS_COLOR = {
  new: 'neutral', awaiting_payment: 'warning', paid: 'success',
  assembling: 'secondary', ready_for_pickup: 'success',
  shipped: 'secondary', completed: 'neutral', cancelled: 'danger',
};
export const DELIVERY_LABEL = {
  pickup_leningradskaya: 'Самовывоз: Ленинградская',
  pickup_titova: 'Самовывоз: Титова',
  courier_nsk: 'Курьер по Новосибирску',
  russia: 'Доставка по России',
};
export const PAYMENT_LABEL = {
  online: 'Онлайн', cash_on_pickup: 'Наличными при получении', card_on_pickup: 'Картой при получении',
};
/** Зеркало графа бэкенда — только для видимости кнопок; истина на бэкенде. */
export const NEXT_STATUSES = {
  new: ['assembling', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['assembling', 'cancelled'],
  assembling: ['ready_for_pickup', 'shipped'],
  ready_for_pickup: ['completed'],
  shipped: ['completed'],
  completed: [], cancelled: [],
};
