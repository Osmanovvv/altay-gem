import { useState } from 'react';
import OrdersList from './OrdersList';
import OrderDetail from './OrderDetail';

export default function App() {
  const [openedId, setOpenedId] = useState(null);
  return openedId
    ? <OrderDetail id={openedId} onBack={() => setOpenedId(null)} />
    : <OrdersList onOpen={setOpenedId} />;
}
