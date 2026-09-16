import { cn } from "~/lib/utils";

interface ContentType {
  id: string;
  label: string;
  icon: string;
}

interface ContentTypeSelectorProps {
  types: ContentType[];
  selected: string[];
  onChange: (selected: string[]) => void;
  maxSelections?: number;
  className?: string;
}

const defaultTypes: ContentType[] = [
  { id: "description", label: "Property Description", icon: "🏠" },
  { id: "flyer", label: "Open House Flyer", icon: "📄" },
  { id: "social", label: "Social Media Post", icon: "📱" },
  { id: "email", label: "Email Campaign", icon: "📧" },
  { id: "summary", label: "Listing Summary", icon: "📋" },
];

export function ContentTypeSelector({
  types = defaultTypes,
  selected,
  onChange,
  maxSelections,
  className,
}: ContentTypeSelectorProps) {
  const handleToggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      if (maxSelections && selected.length >= maxSelections) {
        return;
      }
      onChange([...selected, id]);
    }
  };

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5", className)}>
      {types.map((type) => {
        const isSelected = selected.includes(type.id);
        const isDisabled = maxSelections ? selected.length >= maxSelections && !isSelected : false;

        return (
          <button
            key={type.id}
            type="button"
            onClick={() => handleToggle(type.id)}
            disabled={isDisabled}
            className={cn(
              "group relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center text-xs transition-all duration-300",
              isSelected
                ? "border-emerald-600/60 bg-emerald-900/30 shadow-[0_0_10px_rgba(74,140,63,0.15)]"
                : "border-emerald-800/30 bg-[#0a1a0a]/60 hover:border-emerald-600/40",
              isDisabled && "cursor-not-allowed opacity-40",
              !isDisabled && !isSelected && "hover:bg-emerald-900/10",
            )}
            title={isDisabled ? `Max ${maxSelections} selections` : type.label}
          >
            <span className={cn(
              "text-xl transition-transform duration-300",
              isSelected && "animate-icon-bounce"
            )}>
              {type.icon}
            </span>
            <span className={cn(
              "font-medium transition-colors",
              isSelected ? "text-emerald-200" : "text-emerald-300/60 group-hover:text-emerald-200/80"
            )}>
              {type.label}
            </span>
            {isSelected && (
              <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white shadow-sm">
                ✓
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}