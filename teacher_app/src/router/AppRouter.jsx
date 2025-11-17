import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "../pages/Login/LoginPage";
import HomePage from "../pages/Home/HomePage";
import SessionPage from "@/pages/SessionPage";
import ReportPage from "@/pages/ReportPage";
import SessionReviewPage from "@/pages/SessionReviewPage";
import ProtectedRoute from "./ProtectedRoute";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route
          path="/session/:sessionId/review"
          element={<SessionReviewPage />}
        />
        <Route path="/report" element={<ReportPage />} />
        {/* other pages will be added */}
      </Routes>
    </BrowserRouter>
  );
}
