import type { ProductImageSource } from "@/lib/types";

interface PhotoSourceLabelProps {
  source?: ProductImageSource;
  className?: string;
}

export function PhotoSourceLabel({ source, className = "" }: PhotoSourceLabelProps) {
  if (source !== "web_search") return null;

  return (
    <p
      className={`text-[10px] font-medium leading-tight text-stone-400 ${className}`}
    >
      Photo from web search
    </p>
  );
}
