import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppProvider } from './AppContext';
import { AssessmentPage } from './pages/AssessmentPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PlansPage } from './pages/PlansPage';
import { ResultPage } from './pages/ResultPage';

export default function App() {
  return (
    <AppProvider>
      {/* HashRouter: Telegram apre la Mini App su un URL fisso, senza
          controllo sul routing lato server. */}
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/assessment/:type" element={<AssessmentPage />} />
          <Route path="/result/:id" element={<ResultPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/storico" element={<HistoryPage />} />
          <Route path="/piani" element={<PlansPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
