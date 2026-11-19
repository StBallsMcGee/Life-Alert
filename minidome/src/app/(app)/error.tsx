"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-6 max-w-md p-6 text-center">
      <h1 className="text-lg font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-gray-500">The page couldn&apos;t load. Your picks are safe. Try again{error.digest ? ` (code ${error.digest})` : ""}.</p>
      <button className="btn-primary mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
