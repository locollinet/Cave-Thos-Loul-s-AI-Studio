import { Route, Routes } from 'react-router-dom';
import InvoiceList from './InvoiceList';
import NewInvoice from './NewInvoice';

export default function AchatsModule() {
  return (
    <Routes>
      <Route index element={<InvoiceList />} />
      <Route path="nouveau" element={<NewInvoice />} />
      <Route path=":id/edit" element={<NewInvoice />} />
    </Routes>
  );
}
