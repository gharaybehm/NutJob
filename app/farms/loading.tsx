export default function FarmsLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center px-4 py-12">
      <div className="w-48 h-12 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse mb-8" />
      <div className="w-full max-w-4xl">
        <div className="h-8 w-36 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse mb-2" />
        <div className="h-4 w-64 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 bg-white dark:bg-slate-900 rounded-2xl animate-pulse ring-1 ring-slate-200 dark:ring-slate-800"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
