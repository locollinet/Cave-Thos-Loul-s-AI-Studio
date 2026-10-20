import { Route, Routes } from 'react-router-dom';
import ListsIndex from './ListsIndex';
import Editor from './Editor';

export default function CarteModule() {
  return (
    <Routes>
      <Route index element={<ListsIndex />} />
      <Route path=":id" element={<Editor />} />
    </Routes>
  );
}
