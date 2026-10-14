import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Ловит ошибки отрисовки, чтобы вместо пустого чёрного экрана показать понятное сообщение. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ошибка отрисовки', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container">
        <div className="card">
          <h2>Что-то пошло не так</h2>
          <p className="muted">Страница не смогла отобразиться. Попробуйте обновить её.</p>
          <pre className="error" style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
          <div className="row">
            <button className="btn primary" onClick={() => window.location.reload()}>
              Обновить страницу
            </button>
            <a className="btn" href="/">
              На главную
            </a>
          </div>
        </div>
      </div>
    );
  }
}
