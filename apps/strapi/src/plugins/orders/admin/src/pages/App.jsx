import { useState } from 'react';
import { Box, Button, Flex } from '@strapi/design-system';
import OrdersList from './OrdersList';
import OrderDetail from './OrderDetail';
import EvotorSync from './EvotorSync';

/**
 * Две вкладки одного раздела: заказы (ежедневная работа) и обмен с Эвотором
 * (загрузка выгрузки + сверка). Раньше выгрузку клали на сервер через scp —
 * теперь это делается здесь же, без доступа к серверу.
 */
export default function App() {
  const [openedId, setOpenedId] = useState(null);
  const [tab, setTab] = useState('orders');

  if (openedId) {
    return <OrderDetail id={openedId} onBack={() => setOpenedId(null)} />;
  }

  return (
    <Box>
      <Box paddingLeft={8} paddingRight={8} paddingTop={6}>
        <Flex gap={2}>
          <Button
            variant={tab === 'orders' ? 'default' : 'tertiary'}
            onClick={() => setTab('orders')}
          >
            Заказы
          </Button>
          <Button
            variant={tab === 'evotor' ? 'default' : 'tertiary'}
            onClick={() => setTab('evotor')}
          >
            Обмен с Эвотором
          </Button>
        </Flex>
      </Box>
      {tab === 'orders' ? <OrdersList onOpen={setOpenedId} /> : <EvotorSync />}
    </Box>
  );
}
