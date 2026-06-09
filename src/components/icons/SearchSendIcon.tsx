interface SearchSendIconProps {
  size?: number;
  className?: string;
}

/**
 * Custom "search & send" mark — a magnifying glass with a northeast arrow
 * tucked inside the lens. Reads as a send button but signals that Homivion is
 * searching for the best product/deal, not just sending a message.
 *
 * Outline style, thin weight, crisp at 16–20px. The lens is drawn a touch
 * heavier than the arrow so the magnifying glass stays the dominant cue.
 */
export function SearchSendIcon({ size = 20, className }: SearchSendIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Magnifying glass lens — slightly more prominent */}
      <circle cx="10" cy="10" r="7" strokeWidth="2" />
      {/* Handle */}
      <path d="M15.1 15.1 L20.5 20.5" strokeWidth="2" strokeLinecap="round" />
      {/* Northeast arrow inside the lens */}
      <path
        d="M7.6 12.4 L12.4 7.6"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.3 7.6 H12.4 V10.7"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
