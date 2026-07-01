export default function FarmsLoading() {
  return (
    <div className="min-h-screen bg-paper flex flex-col items-center px-4 py-12">
      <div className="w-48 h-12 bg-tile-2 rounded-xl animate-pulse mb-8" />
      <div className="w-full max-w-4xl">
        <div className="h-8 w-36 bg-tile-2 rounded-lg animate-pulse mb-2" />
        <div className="h-4 w-64 bg-tile rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 bg-surface rounded-2xl animate-pulse border border-line"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
