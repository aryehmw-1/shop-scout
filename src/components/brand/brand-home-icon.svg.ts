/** Canonical home-mark SVG (matches Logo + favicon). Keep in sync with `src/app/icon.svg`. */
export const BRAND_HOME_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" role="img" aria-label="Shop Scout">
  <defs>
    <linearGradient id="ss-home-grad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f97316"/>
      <stop offset="0.5" stop-color="#f59e0b"/>
      <stop offset="1" stop-color="#f43f5e"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="9" fill="url(#ss-home-grad)"/>
  <path
    d="M6 14.75 16 7.75 26 14.75V23.5a1.25 1.25 0 0 1-1.25 1.25H20v-7.25h-8v7.25H7.25A1.25 1.25 0 0 1 6 23.5V14.75Z"
    stroke="#ffffff"
    stroke-width="2.1"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;
