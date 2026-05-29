/** Compare / discovery nav icon — radar pulse + tag (not legal scale). */

interface ShopScoutCompareIconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function ShopScoutCompareIcon({
  size = 18,
  className = "",
  strokeWidth = 2,
}: ShopScoutCompareIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M14.5 14.5L20 20"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M10 6.5V10M7.5 8.25H12.5"
        stroke="currentColor"
        strokeWidth={strokeWidth * 0.9}
        strokeLinecap="round"
      />
      <path
        d="M16 4.5C17.2 5.8 18 7.3 18 9"
        stroke="currentColor"
        strokeWidth={strokeWidth * 0.85}
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M19 7.5L16.2 9.2L17.8 12"
        stroke="currentColor"
        strokeWidth={strokeWidth * 0.85}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}
