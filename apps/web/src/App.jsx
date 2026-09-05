import { Component, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from './context/Session';
import { ToastProvider } from './context/Toast';
import { RocketMark } from './components/brand/RocketMark';
import Splash from './components/landing/Splash';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import BuilderPage from './pages/BuilderPage';
import PublicSitePage from './pages/PublicSitePage';
import PreviewPage from './pages/PreviewPage';
import PricingPage from './pages/PricingPage';
import AccountPage from './pages/AccountPage';
import AuthPage from './pages/AuthPage';
import LegalPage from './pages/LegalPage';
import WizardPage from './pages/WizardPage';
import NotFoundPage from './pages/NotFoundPage';

const SPLASH_KEY = 'launchpad.splash.seen';

/** Restoring a session should never look like being signed out. */
function BootScreen() {
  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-ink-300">
        <RocketMark size={30} />
        <p className="text-[14px]">Warming up Launchpad…</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const { ready, isAuthed } = useSession();
  const location = useLocation();
  if (!ready) return <BootScreen />;
  if (!isAuthed) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

/** Landing route: splash on first visit, dashboard straight away when signed in. */
function LandingRoute() {
  const { ready, isAuthed } = useSession();
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return sessionStorage.getItem(SPLASH_KEY) !== '1';
    } catch {
      return true;
    }
  });

  if (!ready) return <BootScreen />;
  if (isAuthed) return <Navigate to="/dashboard" replace />;
  if (showSplash) return <Splash onDone={() => setShowSplash(false)} />;
  return <LandingPage />;
}

/**
 * /start is the landing CTA. Signed-in visitors land in the wizard with their
 * launch type already chosen; everyone else signs up first and comes back here.
 */
function StartRoute() {
  const { ready, isAuthed } = useSession();
  const location = useLocation();
  if (!ready) return <BootScreen />;
  if (!isAuthed) return <Navigate to={`/sign-up${location.search}`} replace state={{ from: `/build${location.search}` }} />;
  return <WizardPage />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="shell grid min-h-[60vh] place-items-center">
          <div className="panel max-w-md p-6">
            <h1 className="font-display text-xl">Launchpad hit a snag</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">{String(this.state.error.message || this.state.error)}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="rounded-pill bg-white px-4 py-2 text-sm font-medium text-ink-900" onClick={() => window.location.reload()}>
                Reload
              </button>
              <a href="/dashboard" className="rounded-pill border border-line px-4 py-2 text-sm text-ink-100 hover:border-white/30">
                Back to dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/start" element={<StartRoute />} />
        <Route
          path="/build"
          element={
            <RequireAuth>
              <WizardPage />
            </RequireAuth>
          }
        />
        <Route path="/how-it-works" element={<LandingPage showHowItWorksFirst />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/sign-in" element={<AuthPage mode="signin" />} />
        <Route path="/sign-up" element={<AuthPage mode="signup" />} />
        <Route path="/forgot" element={<AuthPage mode="forgot" />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route
          path="/builder/:id"
          element={
            <RequireAuth>
              <BuilderPage />
            </RequireAuth>
          }
        />
        <Route
          path="/preview/:id"
          element={
            <RequireAuth>
              <PreviewPage />
            </RequireAuth>
          }
        />
        {/* Published sites live at /:slug — after every app route, so nothing shadows them. */}
        <Route path="/:slug" element={<PublicSitePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export function AppContainer() {
  return (
    <ToastProvider>
      <SessionProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </SessionProvider>
    </ToastProvider>
  );
}

export default AppContainer;
