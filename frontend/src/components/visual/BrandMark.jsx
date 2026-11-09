export default function BrandMark({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="7" height="7" rx="1.5" />
      <rect x="9" width="7" height="7" rx="1.5" />
      <rect y="9" width="7" height="7" rx="1.5" />
      <rect x="9" y="9" width="7" height="7" rx="1.5" />
    </svg>
  );
}
