export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <form
        method="post"
        action="/api/login"
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold">KarCare Invoices</h1>
        <input type="hidden" name="next" value={next ?? "/"} />
        <label className="block text-sm">
          <span className="text-slate-600">Password</span>
          <input
            type="password"
            name="password"
            autoFocus
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
        </label>
        {error && <p className="text-sm text-red-600">Incorrect password.</p>}
        <button className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Sign in
        </button>
      </form>
    </main>
  );
}
