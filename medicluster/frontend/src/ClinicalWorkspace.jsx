import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./components/AppShell";
import AlertsPage from "./pages/AlertsPage";
import ReportsPage from "./pages/ReportsPage";
import DashboardPage from "./pages/DashboardPage";
import ResultsPage from "./pages/ResultsPage";
import ImagingPage from "./pages/ImagingPage";
import PatientPage from "./pages/PatientPage";
import RemindersPage from "./pages/RemindersPage";
import AskAIPage from "./pages/AskAIPage";
import NearbyHospitalsPage from "./pages/NearbyHospitalsPage";
import ClinicalAIPage from "./pages/ClinicalAIPage";

const BrainExplorerPage = lazy(() => import("./pages/BrainExplorerPage"));
const DeteriorationRadarPage = lazy(() => import("./pages/DeteriorationRadarPage"));

export default function ClinicalWorkspace() {
  return (
      <AppShell>
        <Suspense fallback={<p className="p-8">Loading workspace…</p>}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/imaging" element={<ImagingPage />} />
          <Route path="/brain-explorer" element={<BrainExplorerPage />} />
          <Route path="/deterioration-radar" element={<DeteriorationRadarPage />} />
          <Route path="/results/:id" element={<ResultsPage />} />
          <Route path="/predict" element={<Navigate to="/dashboard" replace />} />
          <Route path="/patient" element={<PatientPage />} />
          <Route path="/patient/:patientId" element={<PatientPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/reminders/:patientId" element={<RemindersPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/ask-ai" element={<AskAIPage />} />
          <Route path="/ml-tools" element={<Navigate to="/dashboard" replace />} />
          <Route path="/hospitals" element={<NearbyHospitalsPage />} />
          <Route path="/clinical-ai" element={<ClinicalAIPage />} />
        </Routes>
        </Suspense>
      </AppShell>
  );
}
