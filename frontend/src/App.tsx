import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { MovementsLayout } from './components/MovementsLayout';
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
import { MovementsListPage } from './pages/MovementsListPage';
import { MovementsSummaryPage } from './pages/MovementsSummaryPage';
import { RegisterMovementPage } from './pages/RegisterMovementPage';
import { DashboardPage } from './pages/DashboardPage';
import { ImportPage } from './pages/ImportPage';
import { GoalsPage } from './pages/GoalsPage';
import { WealthPage } from './pages/WealthPage';
import { StockDetailPage } from './pages/StockDetailPage';
import { StockImportPage } from './pages/StockImportPage';
import { BackupPage } from './pages/BackupPage';
import { ReceiptImportPage } from './pages/ReceiptImportPage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { ReceiptDetailPage } from './pages/ReceiptDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ShoppingListsPage } from './pages/ShoppingListsPage';

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
            {/* Spec 006 (páginas de movimientos): "Ingresos y gastos" pasa
                a ser 3 sub-páginas con su propia sub-navegación, plan.md §1. */}
            <Route path="/movements" element={<MovementsLayout />}>
              <Route index element={<MovementsListPage />} />
              <Route path="summary" element={<MovementsSummaryPage />} />
              <Route path="register" element={<RegisterMovementPage />} />
              <Route path="register/:id" element={<RegisterMovementPage />} />
            </Route>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/patrimonio" element={<WealthPage />} />
            <Route path="/patrimonio/acciones/importar" element={<StockImportPage />} />
            <Route path="/patrimonio/acciones/:id" element={<StockDetailPage />} />
            <Route path="/tickets/importar" element={<ReceiptImportPage />} />
            <Route path="/tickets/productos/:id" element={<ProductDetailPage />} />
            <Route path="/tickets/productos" element={<ProductsPage />} />
            <Route path="/tickets/cesta" element={<ShoppingListsPage />} />
            <Route path="/tickets/:id" element={<ReceiptDetailPage />} />
            <Route path="/tickets" element={<ReceiptsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/backup" element={<BackupPage />} />
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
