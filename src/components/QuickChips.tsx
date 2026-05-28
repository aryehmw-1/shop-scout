"use client";

interface QuickChipsProps {
  chips: string[];
  onSelect: (chip: string) => void;
  disabled?: boolean;
}

export function QuickChips({ chips, onSelect, disabled }: QuickChipsProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(chip)}
          className="rounded-full border border-sage-200 bg-sage-50 px-3.5 py-1.5 text-sm text-sage-800 transition hover:border-sage-400 hover:bg-sage-100 disabled:opacity-50"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
