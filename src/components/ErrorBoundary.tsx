import { Component, type ReactNode } from 'react';
import { FatalError } from './FatalError';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort safety net. Without this, any uncaught render error unmounts the
 * whole app and leaves a blank white screen with nothing but a console error.
 * This shows something actionable instead.
 *
 * Note: this only catches errors thrown during React rendering/lifecycle. An
 * error thrown at module-evaluation time (e.g. top-level in a file that's
 * statically imported) runs before React ever starts and will NOT be caught
 * here — guard those with a runtime check + conditional render instead (see
 * main.tsx / lib/supabase.ts).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('App crashed:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <FatalError title="Something went wrong" message={error.message} />;
  }
}
