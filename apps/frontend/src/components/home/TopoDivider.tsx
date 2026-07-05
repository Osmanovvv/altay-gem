interface TopoDividerProps {
  color?: string;
  background?: string;
}

export function TopoDivider({
  color = "#3b6e4a",
  background = "var(--color-bg-cream)",
}: TopoDividerProps) {
  return (
    <div style={{ backgroundColor: background, padding: "16px 0" }}>
      <svg
        aria-hidden
        viewBox="0 0 1440 60"
        preserveAspectRatio="none"
        className="mx-auto block w-full max-w-7xl"
        style={{ height: 40, color }}
      >
        <path
          d="M0 30 C 120 6, 240 54, 360 30 C 480 6, 600 54, 720 30 C 840 6, 960 54, 1080 30 C 1200 6, 1320 54, 1440 30"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          opacity="0.75"
        />
        <path
          d="M0 42 C 160 22, 320 60, 480 38 C 640 18, 800 58, 960 36 C 1120 18, 1280 56, 1440 38"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.9"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}

export default TopoDivider;
