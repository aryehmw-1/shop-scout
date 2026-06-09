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
      {/* Magnifying glass lens — slightly more prominent. Centered so the
          whole glyph sits balanced inside a circular button. */}
      <circle cx="11" cy="11" r="6.5" strokeWidth="2" />
      {/* Handle reaching toward the corner */}
      <path d="M15.7 15.7 L20 20" strokeWidth="2" strokeLinecap="round" />
      {/* Northeast arrow inside the lens */}
      <path
        d="M8.8 13.2 L13.2 8.8"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.4 8.8 H13.2 V11.6"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
