import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { HomePage } from './pages/HomePage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ResendVerificationPage } from './pages/ResendVerificationPage';
import { LoginPage } from './pages/LoginPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SessionsPage } from './pages/SessionsPage';
import { ProfilePage } from './pages/ProfilePage';
import { CategoriesPage } from './pages/CategoriesPage';
import { MovementsPage } from './pages/MovementsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ImportPage } from './pages/ImportPage';
import { GoalsPage } from './pages/GoalsPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Spec 005 (navegación): las 8 páginas autenticadas comparten el
              menú lateral de `AppLayout` como ruta de layout (plan.md §1). */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/movements" element={<MovementsPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/sessions" element={<SessionsPage />} />
          </Route>

          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/resend-verification" element={<ResendVerificationPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
