import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Button, Flex, Loader, Badge, Divider,
} from '@strapi/design-system';
import { fetchEvotorStatus, runReconcile, uploadExport } from '../api';

/**
 * Обмен с Эвотором: загрузка суточной выгрузки и запуск сверки.
 *
 * Зачем страница: раньше файл клали на сервер через scp — теперь достаточно
 * скачать xlsx в товароучётке и перетащить сюда. Сверка авторитетна и
 * применяет файл «в пользу Эвотора», поэтому загружать нужно СВЕЖУЮ выгрузку:
 * старый файл откатил бы остатки, насчитанные чеками. Об этом — подпись ниже.
 */
const STORES = [
  { id: '20190416-67ab-402e-80e8-194b143cce8f', name: 'Ленинградская 75/2' },
  { id: '20220807-1add-4053-80d3-4e9b17044e43', name: 'Титова 32' },
];

const fmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU');
};

const ageHours = (iso) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000) : null;

/** «3 ч» / «2 дня 5 ч» — чтобы возраст снимка читался без арифметики в уме. */
const humanAge = (h) => {
  const whole = Math.floor(h);
  if (whole < 1) return 'меньше часа';
  if (whole < 24) return `${whole} ч`;
  return `${Math.floor(whole / 24)} дн ${whole % 24} ч`;
};

export default function EvotorSync() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const inputs = useRef({});

  const load = useCallback(async () => {
    try {
      setStatus(await fetchEvotorStatus());
    } catch (e) {
      setMsg({ kind: 'error', text: e?.response?.data?.error || 'Не удалось получить состояние обмена' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onPick = async (storeId, file) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await uploadExport(storeId, file);
      // Бэкенд достаёт момент СНЯТИЯ выгрузки из самого файла и отбивает
      // негодные (протухшие, с невозможным временем). Показываем это сразу:
      // человек ещё у экрана и может скачать выгрузку заново.
      setMsg({
        kind: r.warn ? 'warn' : 'ok',
        text:
          `Выгрузка принята: ${Math.round((r.bytes ?? 0) / 1024)} КБ, ` +
          `снята ${fmt(r.snapshotAt)}` +
          (r.ageHours != null ? ` (${humanAge(r.ageHours)} назад)` : '') +
          `. Теперь нажмите «Свести остатки».` +
          (r.warn ? `\n\nВНИМАНИЕ: ${r.warn}` : ''),
      });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: e?.response?.data?.error || 'Не удалось загрузить файл' });
    } finally {
      setBusy(false);
      if (inputs.current[storeId]) inputs.current[storeId].value = '';
    }
  };

  const onReconcile = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await runReconcile();
      const list = Array.isArray(res) ? res : [];
      setMsg({
        kind: 'ok',
        text: list.length
          ? `Сверка выполнена: ${list.map((s) => `${s.upserted ?? 0} позиций`).join(', ')}`
          : 'Сверка не применила ни одного файла — проверьте свежесть выгрузок',
      });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: e?.response?.data?.error || 'Сверка не выполнилась' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Box padding={8}><Loader>Загрузка…</Loader></Box>;

  const rec = status?.reconcile ?? {};
  const lastAge = ageHours(rec.lastOkAt);
  // Сверка идёт раз в сутки, поэтому «давно не проходила» — это больше суток
  // с запасом. Порог тот же, что у алерта в бэкенде.
  const stale = lastAge === null || lastAge > 26;

  return (
    <Box padding={8}>
      <Typography variant="alpha" tag="h1">Обмен с Эвотором</Typography>

      <Box paddingTop={4} paddingBottom={4}>
        <Flex gap={3} alignItems="center">
          <Typography variant="omega">Последняя удачная сверка:</Typography>
          <Typography variant="omega" fontWeight="bold">{fmt(rec.lastOkAt)}</Typography>
          <Badge backgroundColor={stale ? 'danger100' : 'success100'} textColor={stale ? 'danger600' : 'success600'}>
            {stale ? 'нужна свежая выгрузка' : 'актуально'}
          </Badge>
        </Flex>
        <Box paddingTop={2}>
          <Typography variant="pi" textColor="neutral600">
            Чеки с касс приходят сразу и в сверке не нуждаются. Сверка нужна для приёмок,
            переоценок и новых товаров — она приводит остатки к выгрузке из товароучётки.
          </Typography>
        </Box>
      </Box>

      <Divider />

      <Box paddingTop={4} paddingBottom={4}>
        <Typography variant="delta" tag="h2">1. Загрузите свежую выгрузку</Typography>
        <Box paddingTop={2} paddingBottom={4}>
          <Typography variant="pi" textColor="neutral600">
            В товароучётке: Товары → выберите магазин → Обмен → «Скачать в Excel».
            Файл присылайте и загружайте КАК СКАЧАЛСЯ — не открывайте его в Excel:
            при сохранении Excel стирает внутри файла отметку о времени выгрузки,
            и часть остатков останется неисправленной. Момент снятия система
            определит сама и покажет ниже; слишком старую выгрузку не примет.
          </Typography>
        </Box>
        {STORES.map((s) => (
          <Flex key={s.id} gap={4} alignItems="center" paddingBottom={3}>
            <Box style={{ minWidth: 220 }}>
              <Typography variant="omega" fontWeight="bold">{s.name}</Typography>
            </Box>
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              ref={(el) => { inputs.current[s.id] = el; }}
              onChange={(e) => onPick(s.id, e.target.files?.[0])}
            />
          </Flex>
        ))}
      </Box>

      <Divider />

      <Box paddingTop={4}>
        <Typography variant="delta" tag="h2">2. Сведите остатки</Typography>
        <Box paddingTop={2} paddingBottom={3}>
          <Typography variant="pi" textColor="neutral600">
            Запускать после загрузки обоих магазинов. Ночью сверка выполняется сама.
          </Typography>
        </Box>
        <Button onClick={onReconcile} loading={busy} disabled={busy}>Свести остатки</Button>
      </Box>

      {msg && (
        <Box paddingTop={5}>
          <Typography
            variant="omega"
            textColor={
              msg.kind === 'ok'
                ? 'success600'
                : msg.kind === 'warn'
                  ? 'warning600'
                  : 'danger600'
            }
            // Сообщения бэкенда многострочные (объясняют, что делать) —
            // без этого перенос строк схлопнется в одну простыню.
            style={{ whiteSpace: 'pre-line' }}
          >
            {msg.text}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
