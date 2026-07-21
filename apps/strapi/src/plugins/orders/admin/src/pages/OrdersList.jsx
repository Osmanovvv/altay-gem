import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Typography, Table, Thead, Tbody, Tr, Th, Td,
  Badge, SingleSelect, SingleSelectOption, Button, Flex, Loader,
} from '@strapi/design-system';
import { fetchOrders } from '../api';
import { STATUS_LABEL, STATUS_COLOR, DELIVERY_LABEL } from '../labels';

const PAGE = 50;

export default function OrdersList({ onOpen }) {
  const [state, setState] = useState({ items: [], total: 0, loading: true, error: null });
  const [filters, setFilters] = useState({ status: '', deliveryMethod: '', offset: 0 });
  const seq = useRef(0); // защита от out-of-order ответов (поллинг vs ручная загрузка)

  const load = useCallback(async (silent = false) => {
    const my = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchOrders({ ...filters, limit: PAGE });
      if (my !== seq.current) return; // пришёл устаревший ответ — новее уже в пути
      setState({ items: data.items, total: data.total, loading: false, error: null });
    } catch (e) {
      if (my !== seq.current) return;
      const msg = e?.response?.data?.error;
      setState((s) => ({ ...s, loading: false, error: typeof msg === 'string' && msg ? msg : 'Не удалось загрузить заказы' }));
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  // Тихий поллинг: держит список свежим, не мигая лоадером; cleanup обязателен.
  useEffect(() => { const t = setInterval(() => load(true), 30000); return () => clearInterval(t); }, [load]);

  return (
    <Box padding={8}>
      <Typography variant="alpha" tag="h1">Заказы</Typography>
      <Flex gap={4} paddingTop={4} paddingBottom={4}>
        <SingleSelect placeholder="Все статусы" value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v, offset: 0 }))} onClear={() => setFilters((f) => ({ ...f, status: '', offset: 0 }))}>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <SingleSelectOption key={k} value={k}>{v}</SingleSelectOption>
          ))}
        </SingleSelect>
        <SingleSelect placeholder="Все способы получения" value={filters.deliveryMethod}
          onChange={(v) => setFilters((f) => ({ ...f, deliveryMethod: v, offset: 0 }))} onClear={() => setFilters((f) => ({ ...f, deliveryMethod: '', offset: 0 }))}>
          {Object.entries(DELIVERY_LABEL).map(([k, v]) => (
            <SingleSelectOption key={k} value={k}>{v}</SingleSelectOption>
          ))}
        </SingleSelect>
        <Button variant="tertiary" onClick={() => load()}>Обновить</Button>
      </Flex>
      {state.error && <Typography textColor="danger600">{state.error}</Typography>}
      {state.loading ? <Loader>Загрузка…</Loader> : (
        <Table colCount={7} rowCount={state.items.length}>
          <Thead><Tr>
            <Th><Typography variant="sigma">№</Typography></Th>
            <Th><Typography variant="sigma">Дата</Typography></Th>
            <Th><Typography variant="sigma">Клиент</Typography></Th>
            <Th><Typography variant="sigma">Получение</Typography></Th>
            <Th><Typography variant="sigma">Сумма</Typography></Th>
            <Th><Typography variant="sigma">Позиции</Typography></Th>
            <Th><Typography variant="sigma">Статус</Typography></Th>
          </Tr></Thead>
          <Tbody>
            {state.items.map((o) => (
              <Tr key={o.id} onClick={() => onOpen(o.id)} style={{ cursor: 'pointer' }}>
                <Td><Typography fontWeight="bold">{o.orderNumber}</Typography></Td>
                <Td><Typography>{new Date(o.createdAt).toLocaleString('ru-RU')}</Typography></Td>
                <Td><Typography>{o.customerName}<br/>{o.customerPhone}</Typography></Td>
                <Td><Typography>{DELIVERY_LABEL[o.deliveryMethod] ?? o.deliveryMethod}</Typography></Td>
                <Td><Typography>{o.totalRub.toLocaleString('ru-RU')} ₽</Typography></Td>
                <Td><Typography>{o.itemsCount}</Typography></Td>
                <Td><Badge backgroundColor={`${STATUS_COLOR[o.status] ?? 'neutral'}100`} textColor={`${STATUS_COLOR[o.status] ?? 'neutral'}700`}>{STATUS_LABEL[o.status] ?? o.status}</Badge></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
      <Flex paddingTop={4} gap={2}>
        <Button variant="tertiary" disabled={filters.offset === 0}
          onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - PAGE) }))}>← Назад</Button>
        <Typography>{state.total === 0 ? 0 : filters.offset + 1}–{Math.min(filters.offset + PAGE, state.total)} из {state.total}</Typography>
        <Button variant="tertiary" disabled={filters.offset + PAGE >= state.total}
          onClick={() => setFilters((f) => ({ ...f, offset: f.offset + PAGE }))}>Вперёд →</Button>
      </Flex>
    </Box>
  );
}
