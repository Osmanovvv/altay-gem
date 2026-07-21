import { useRef, useState } from 'react';
import { Box, Typography, TextInput, Button, Flex, Badge } from '@strapi/design-system';
import { saveMarkCodes } from '../api';

/** Поля кодов Data Matrix: по одному на ЕДИНИЦУ товара. Сканер = клавиатура+Enter. */
export default function MarkCodes({ orderId, item, frozen, onSaved, onError }) {
  const [codes, setCodes] = useState(
    Array.from({ length: item.quantity }, (_, i) => item.markCodes?.[i] ?? ''),
  );
  const [saving, setSaving] = useState(false);
  const refs = useRef([]);

  const filled = codes.filter((c) => c.trim()).length;

  async function persist() {
    setSaving(true);
    try {
      const r = await saveMarkCodes(orderId, item.id, codes.map((c) => c.trim()).filter(Boolean));
      onSaved(r);
    } catch (e) {
      onError(e?.response?.data?.error || 'Не удалось сохранить коды');
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
