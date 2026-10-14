import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import './styles.css';

// StrictMode намеренно не используется: двойной запуск эффектов мешал бы
// подписке на партию и созданию ожидающих партий в режиме разработки.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>,
);
