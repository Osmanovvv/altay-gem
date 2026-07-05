import type { ReactNode } from "react";

interface PageHeroProps {
  title: string;
  subtitle?: string;
  bgColor?: string;
  accent?: string;
  eyebrow?: string;
  children?: ReactNode;
}

export function PageHero({
  title,
  subtitle,
  bgColor = "var(--color-bg-dark)",
  accent = "var(--color-accent)",
  eyebrow,
  children,
}: PageHeroProps) {
  return (
    <section
      className="relative isolate flex items-end overflow-hidden"
      style={{
        minHeight: "max(40vh, 280px)",
        // color-mix() вместо конкатенации хекс+альфа ("${accent}22") — та
        // склейка ломала весь background, если accent приходит как var(...)
        // (что и есть значение по умолчанию), а не хекс-литерал.
        background: `radial-gradient(120% 80% at 20% 0%, color-mix(in srgb, ${accent} 13%, transparent) 0%, transparent 55%), linear-gradient(160deg, ${bgColor} 0%, #0d1812 100%)`,
        color: "var(--color-text-on-dark)",
        paddingTop: 96,
        paddingBottom: 64,
      }}
    >
      {/* Soft glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 80% 20%, rgba(232,180,79,0.18) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 md:px-8">
        {eyebrow && (
          <span
            className="inline-block"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: accent,
            }}
          >
            {eyebrow}
          </span>
        )}
        <h1
          className="mt-3 text-4xl md:text-6xl"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            lineHeight: 1.02,
            letterSpacing: "-0.01em",
            color: "var(--color-text-on-dark)",
            maxWidth: 760,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-4"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 17,
              lineHeight: 1.5,
              color: "rgba(255,253,247,0.74)",
              maxWidth: 560,
            }}
          >
            {subtitle}
          </p>
        )}
        {children && <div className="mt-6">{children}</div>}
      </div>

      {/* Topographic divider */}
      <svg
        aria-hidden
        viewBox="0 0 1440 80"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[60px] w-full md:h-[80px]"
        style={{ color: "var(--color-bg-cream)" }}
      >
        <path
          d="M0,60 C180,20 360,80 540,50 C720,20 900,70 1080,45 C1260,20 1380,55 1440,40 L1440,80 L0,80 Z"
          fill="currentColor"
        />
        <path
          d="M0,40 C180,10 360,55 540,30 C720,8 900,48 1080,28 C1260,10 1380,38 1440,22"
          fill="none"
          stroke={accent}
          strokeOpacity="0.22"
          strokeWidth="1"
        />
      </svg>
    </section>
  );
}
