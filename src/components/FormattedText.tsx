import { parseBoldText } from "@/lib/utils/format";

export function FormattedText({ text }: { text: string }) {
  const parts = parseBoldText(text);
  return (
    <span>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-stone-800">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}
