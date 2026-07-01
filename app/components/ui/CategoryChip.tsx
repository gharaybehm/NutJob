export type Category = "irrigate" | "fertilize" | "spray" | "scout" | "prune";

export const CATEGORY_STYLES: Record<
  Category,
  { bg: string; text: string; dot: string; label: string }
> = {
  irrigate:  { bg: "bg-blue-soft",   text: "text-blue",   dot: "bg-blue",   label: "Irrigate" },
  fertilize: { bg: "bg-gold-soft",   text: "text-gold",   dot: "bg-gold",   label: "Fertilize" },
  spray:     { bg: "bg-purple-soft", text: "text-purple", dot: "bg-purple", label: "Spray" },
  scout:     { bg: "bg-green-soft",  text: "text-green",  dot: "bg-green",  label: "Scout" },
  prune:     { bg: "bg-teal-soft",   text: "text-teal",   dot: "bg-teal",   label: "Pruning" },
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
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${cfg.bg} ${cfg.text} ${className}`}
    >
      {(label ?? cfg.label).toUpperCase()}
    </span>
  );
}
