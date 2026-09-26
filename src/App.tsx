import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import BackupRoutines from './pages/BackupRoutines';
import CloudStorage from './pages/CloudStorage';
import Restore from './pages/Restore';
import Settings from './pages/Settings'; // <-- NOVO IMPORT

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          {/* As telas abaixo serão injetadas dentro do <Outlet /> do AppLayout */}
          <Route index element={<Dashboard />} />
          <Route path="rotinas" element={<BackupRoutines />} />
          <Route path="nuvem" element={<CloudStorage />} />
          <Route path="restauro" element={<Restore />} />
          <Route path="configuracoes" element={<Settings />} /> {/* <-- NOVA ROTA AQUI */}
        </Route>
      </Routes>
    </Router>
  );
}