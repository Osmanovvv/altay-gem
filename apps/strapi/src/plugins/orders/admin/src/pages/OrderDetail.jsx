import { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Button, Flex, Badge, Loader, Textarea, Divider,
} from '@strapi/design-system';
import { fetchOrder, fiscalize, setStatus } from '../api';
import { STATUS_LABEL, STATUS_COLOR, DELIVERY_LABEL, PAYMENT_LABEL, NEXT_STATUSES } from '../labels';
import MarkCodes from '../components/MarkCodes';

export default function OrderDetail({ id, onBack }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    try { setOrder(await fetchOrder(id)); setError(null); }
    catch (e) {
      const msg = e?.response?.data?.error;
      setError(typeof msg === 'string' && msg ? msg : 'Не удалось загрузить заказ');
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!order) return <Box padding={8}>{error ? <Typography textColor="danger600">{error}</Typography> : <Loader>Загрузка…</Loader>}</Box>;

  const marked = order.items.filter((i) => i.isMarked);
  const allCodesIn = marked.every((i) => (i.markCodes?.length ?? 0) >= i.quantity);
  const color = STATUS_COLOR[order.status] ?? 'neutral';

  /** Мутация: busy на время, перезагрузка карточки после успеха, ошибка — текстом. Возвращает успех. */
  const act = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); return true; }
    catch (e) {
      const msg = e?.response?.data?.error;
      setError(typeof msg === 'string' && msg ? msg : 'Не получилось — повторите');
      return false;
    }
    finally { setBusy(false); }
  };

  return (
    <Box padding={8}>
      <Button variant="tertiary" onClick={onBack}>← К списку</Button>
      <Flex gap={3} paddingTop={2}>
        <Typography variant="alpha" tag="h1">{order.orderNumber}</Typography>
        <Badge backgroundColor={`${color}100`} textColor={`${color}700`}>
          {STATUS_LABEL[order.status] ?? order.status}
        </Badge>
      </Flex>
      {error && <Box paddingTop={2}><Typography textColor="danger600">{error}</Typography></Box>}

      <Box paddingTop={4}>
        <Typography variant="beta">Клиент и получение</Typography>
        <Typography tag="p">{order.customer.name} · {order.customer.phone}{order.customer.email ? ` · ${order.customer.email}` : ''}</Typography>
        <Typography tag="p">{DELIVERY_LABEL[order.deliveryMethod] ?? order.deliveryMethod}{order.deliveryAddress ? ` — ${order.deliveryAddress}` : ''}</Typography>
        <Typography tag="p">Оплата: {PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}{order.paidAt ? ` (оплачен ${new Date(order.paidAt).toLocaleString('ru-RU')})` : ''}</Typography>
        {order.comment && <Typography tag="p">Комментарий: {order.comment}</Typography>}
        {order.cancelReason && <Typography tag="p" textColor="danger600">Причина отмены: {order.cancelReason}</Typography>}
      </Box>

      <Box paddingTop={4}>
        <Typography variant="beta">Позиции</Typography>
        {order.items.map((i) => (
          <Box key={i.id} paddingTop={2}>
            <Typography>{i.name} — {i.quantity} {i.unit} × {i.priceRub.toLocaleString('ru-RU')} ₽ = {i.sumRub.toLocaleString('ru-RU')} ₽ {i.isMarked && <Badge>маркировка</Badge>}</Typography>
            {i.isMarked && order.fiscalizationRequired && (
              <MarkCodes orderId={order.id} item={i} frozen={!!order.fiscalReceiptId || order.fiscalizationInProgress}
                onSaved={() => load()} onError={setError} />
            )}
          </Box>
        ))}
        <Divider marginTop={2} marginBottom={2} />
        <Typography tag="p">Товары: {order.totals.subtotalRub.toLocaleString('ru-RU')} ₽
          {order.totals.discountRub > 0 && <> · Скидка{order.promoCode ? ` (${order.promoCode})` : ''}: −{order.totals.discountRub.toLocaleString('ru-RU')} ₽</>}
          {order.totals.deliveryRub > 0 && <> · Доставка: {order.totals.deliveryRub.toLocaleString('ru-RU')} ₽</>}
        </Typography>
        <Typography fontWeight="bold">Итого: {order.totals.totalRub.toLocaleString('ru-RU')} ₽</Typography>
      </Box>

      {(order.fiscalizationRequired || order.fiscalReceiptId) && (
        <Box paddingTop={4}>
          <Typography variant="beta" tag="h2">Фискализация (маркировка)</Typography>
          {order.fiscalReceiptId
            ? <Badge backgroundColor="success100" textColor="success700">Чек выбит: {order.fiscalReceiptId}</Badge>
            : order.fiscalizationInProgress
              ? <Badge backgroundColor="warning100" textColor="warning700">Чек уходит… обновите через минуту</Badge>
              : (
                <Box paddingTop={2}>
                  {!allCodesIn && <Typography tag="p">Отсканируйте коды всех маркированных единиц и сохраните их — тогда кнопка станет активной.</Typography>}
                  <Button disabled={!allCodesIn || busy} loading={busy}
                    onClick={() => { if (window.confirm('Выбить чек с кодами маркировки? Действие необратимо.')) act(() => fiscalize(order.id)); }}>
                    Фискализировать
                  </Button>
                </Box>
              )}
        </Box>
      )}

      <Box paddingTop={4}>
        <Typography variant="beta" tag="h2">Действия</Typography>
        <Flex gap={2} paddingTop={2}>
          {(NEXT_STATUSES[order.status] ?? []).filter((s) => s !== 'cancelled').map((s) => (
            <Button key={s} disabled={busy} onClick={() => act(() => setStatus(order.id, s))}>
              → {STATUS_LABEL[s]}
            </Button>
          ))}
          {(NEXT_STATUSES[order.status] ?? []).includes('cancelled') && (
            <Button variant="danger" disabled={busy} onClick={() => setCancelOpen(true)}>Отменить заказ</Button>
          )}
        </Flex>
      </Box>

      {cancelOpen && (
        <Box paddingTop={2}>
          <Textarea placeholder="Причина отмены (обязательно)" value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)} />
          <Flex gap={2} paddingTop={2}>
            <Button variant="danger" disabled={!cancelReason.trim() || busy}
              onClick={async () => {
                const ok = await act(() => setStatus(order.id, 'cancelled', cancelReason.trim()));
                if (ok) setCancelOpen(false); // при ошибке форму не прячем — текст причины не теряется
              }}>
              Подтвердить отмену
            </Button>
            <Button variant="tertiary" onClick={() => setCancelOpen(false)}>Не отменять</Button>
          </Flex>
        </Box>
      )}
    </Box>
  );
}
