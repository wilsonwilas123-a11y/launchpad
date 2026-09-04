import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../../apps/web/src/App';
import { SessionProvider } from '../../apps/web/src/context/Session';
import { ToastProvider } from '../../apps/web/src/context/Toast';

let root = null;

export function mount(path) {
  const container = document.getElementById('root');
  // A fresh router per path: MemoryRouter only honours initialEntries on creation.
  if (root) root.unmount();
  root = createRoot(container);
  root.render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <SessionProvider>
          <AppRoutes />
        </SessionProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

export function text() {
  return document.getElementById('root').textContent || '';
}

export function html() {
  return document.getElementById('root').innerHTML || '';
}
