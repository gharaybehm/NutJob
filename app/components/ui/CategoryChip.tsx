export type Category = "irrigate" | "fertilize" | "spray" | "scout" | "prune";

export const CATEGORY_STYLES: Record<
  Category,
  { bg: string; text: string; dot: string; label: string }
> = {
  irrigate:  { bg: "bg-blue-soft",   text: "text-blue-ink",   dot: "bg-blue",   label: "Irrigate" },
  fertilize: { bg: "bg-gold-soft",   text: "text-gold-ink",   dot: "bg-gold",   label: "Fertilize" },
  spray:     { bg: "bg-purple-soft", text: "text-purple", dot: "bg-purple", label: "Spray" },
  // Scout used to share green with the "healthy" status and pruning took teal;
  // categories now use hues no status uses.
  scout:     { bg: "bg-teal-soft",   text: "text-teal-ink",   dot: "bg-teal",   label: "Scout" },
  prune:     { bg: "bg-brown-soft",  text: "text-brown-ink",  dot: "bg-brown",  label: "Pruning" },
};

/** Maps the DB/calendar activity-type strings onto the 5 design categories. */
export function categoryFromActivityType(type: string): Category {
  switch (type) {
    case "irrigation": return "irrigate";
    case "fertigation": return "fertilize";
    case "spraying": return "spray";
    case "scouting":
    case "pollinating": return "scout";
    case "pruning": return "prune";
    default: return "scout";
  }
}

export function CategoryChip({
  category,
  label,
  className = "",
}: {
  category: Category;
  label?: string;
  className?: string;
}) {
  const cfg = CATEGORY_STYLES[category];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide ${cfg.bg} ${cfg.text} ${className}`}
    >
      {(label ?? cfg.label).toUpperCase()}
    </span>
  );
}
