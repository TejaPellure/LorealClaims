import { Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import AssessmentReportPage from './pages/AssessmentReportPage';
import ClaimsPage from './pages/ClaimsPage';
import DashboardPage from './pages/DashboardPage';
import EvidencePage from './pages/EvidencePage';
import FormulationStudioPage from './pages/FormulationStudioPage';
import HistoryPage from './pages/HistoryPage';
import IngredientsPage from './pages/IngredientsPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="ingredients" element={<IngredientsPage />} />
        <Route path="evidence" element={<EvidencePage />} />
        <Route path="studio" element={<FormulationStudioPage />} />
        <Route path="claims" element={<ClaimsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="assessments/:id" element={<AssessmentReportPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
