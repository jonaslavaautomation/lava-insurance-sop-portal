export function FatalError({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-lg font-bold text-slate-900 mb-2">{title}</h1>
        <p className="text-sm text-slate-500 mb-4">
          The app failed to start. This is almost always a missing configuration
          value rather than a bug in the page you were viewing.
        </p>
        <pre className="text-xs text-brand-700 bg-brand-50 border border-brand-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
          {message}
        </pre>
        <p className="text-xs text-slate-400 mt-4">
          If this mentions Supabase / env vars, check that{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
          are set for this environment (e.g. in Vercel → Settings → Environment
          Variables) and redeploy.
        </p>
      </div>
    </div>
  );
}
