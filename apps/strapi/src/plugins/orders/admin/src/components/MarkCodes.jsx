import { useEffect, useRef, useState } from 'react';
import { Box, Typography, TextInput, Button, Flex, Badge } from '@strapi/design-system';
import { saveMarkCodes } from '../api';

/**
 * Поля кодов Data Matrix: по одному на ЕДИНИЦУ товара. Сканер = клавиатура+Enter.
 *
 * Локальный state кодов сознательно НЕ пересинхронизируется с сервером после
 * load() родителя: при ошибке сохранения ввод оператора должен уцелеть —
 * он правит и пересохраняет, а не сканирует всё заново. Гейт фискализации
 * при этом считается по СЕРВЕРНЫМ данным (order.items[].markCodes), так что
 * несохранённый локальный ввод кнопку не разблокирует.
 */
export default function MarkCodes({ orderId, item, frozen, onSaved, onError }) {
  const [codes, setCodes] = useState(
    Array.from({ length: item.quantity }, (_, i) => item.markCodes?.[i] ?? ''),
  );
  const [saving, setSaving] = useState(false);
  const refs = useRef([]);

  // Сканерный UX: при маунте курсор сразу в первом ПУСТОМ поле — пикай без мыши.
  useEffect(() => {
    const i = codes.findIndex((c) => !c.trim());
    if (i >= 0) refs.current[i]?.focus?.();
    // только на маунте — codes дальше меняет оператор
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filled = codes.filter((c) => c.trim()).length;

  async function persist() {
    onError(null); // прошлая ошибка не должна висеть над новой попыткой
    setSaving(true);
    try {
      const r = await saveMarkCodes(orderId, item.id, codes.map((c) => c.trim()).filter(Boolean));
      onSaved(r);
    } catch (e) {
      const msg = e?.response?.data?.error;
      onError(typeof msg === 'string' && msg ? msg : 'Не удалось сохранить коды');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box paddingTop={2}>
      <Flex gap={2}>
        <Typography fontWeight="bold">Коды «Честного знака»</Typography>
        <Badge>{filled} из {item.quantity}</Badge>
      </Flex>
      {codes.map((code, i) => (
        <Box key={i} paddingTop={1}>
          <TextInput
            ref={(el) => (refs.current[i] = el)}
            placeholder={`Код единицы ${i + 1} — пикните сканером`}
            value={code}
            disabled={frozen || saving}
            onChange={(e) => {
              const next = [...codes];
              next[i] = e.target.value;
              setCodes(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                refs.current[i + 1]?.focus?.();
              }
            }}
          />
        </Box>
      ))}
      {!frozen && (
        <Box paddingTop={2}>
          <Button variant="secondary" loading={saving} onClick={persist}>Сохранить коды</Button>
        </Box>
      )}
    </Box>
  );
}
