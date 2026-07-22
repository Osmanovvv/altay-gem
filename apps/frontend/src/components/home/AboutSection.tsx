import { motion } from "framer-motion";
import { Calendar, MapPin, Package } from "lucide-react";

const FACTS = [
  { icon: MapPin, value: "2 магазина", label: "в Новосибирске" },
  { icon: Package, value: "2000+", label: "наименований" },
  { icon: Calendar, value: "с 2018", label: "года на рынке" },
];

export function AboutSection() {
  return (
    <section
      id="about"
      style={{
        backgroundColor: "var(--color-bg-cream)",
        padding: "80px 0",
      }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 md:px-8 lg:grid-cols-2 lg:gap-16">
        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-accent-dark)",
            }}
          >
            О магазине
          </span>
          <h2
            className="mt-3 text-4xl md:text-5xl"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              color: "var(--color-accent)",
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
            }}
          >
            Жемчужина Алтая - вкус настоящего
          </h2>
          <p
            className="mt-6"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 16,
              lineHeight: 1.65,
              color: "var(--color-text)",
              maxWidth: 560,
            }}
          >
            Два магазина в Новосибирске. Работаем напрямую с алтайскими производителями - «Алтайская
            деревня» и «Шлегель». Более 2000 наименований натуральной продукции: от мёда и сыров до
            косметики и бальзамов. Каждый продукт проверен и сертифицирован.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {FACTS.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.45, delay: 0.15 + i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div
                    className="flex shrink-0 items-center justify-center rounded-full"
                    style={{
                      width: 48,
                      height: 48,
                      backgroundColor: "rgba(200,150,62,0.14)",
                      color: "var(--color-accent-dark)",
                    }}
                  >
                    <Icon size={22} strokeWidth={1.75} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 600,
                        fontSize: 20,
                        lineHeight: 1.1,
                        color: "var(--color-text)",
                      }}
                    >
                      {f.value}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 13,
                        color: "var(--color-text-muted)",
                      }}
                    >
                      {f.label}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Mountains SVG */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative"
        >
          <div
            className="relative overflow-hidden"
            style={{
              aspectRatio: "5 / 4",
              borderRadius: 24,
              background: "linear-gradient(180deg, #faf7f2 0%, #efe7d6 100%)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <svg aria-hidden viewBox="0 0 600 480" className="absolute inset-0 h-full w-full">
              {/* Sun */}
              <circle cx="430" cy="150" r="44" fill="#e8b44f" opacity="0.55" />

              {/* Background ridges */}
              <path
                d="M0 360 L80 280 L160 320 L260 220 L340 290 L430 200 L520 280 L600 230 L600 480 L0 480 Z"
                fill="#2d5a3f"
                opacity="0.35"
              />
              <path
                d="M0 400 L100 320 L200 370 L300 280 L380 340 L470 260 L560 320 L600 290 L600 480 L0 480 Z"
                fill="#2d5a3f"
                opacity="0.55"
              />
              {/* Foreground */}
              <path
                d="M0 440 L120 360 L240 420 L360 340 L460 400 L560 350 L600 380 L600 480 L0 480 Z"
                fill="#1a3028"
                opacity="0.85"
              />

              {/* Topographic contour lines */}
              <g fill="none" stroke="#2d5a3f" strokeWidth="1.1" opacity="0.55">
                <path d="M40 380 C 140 340, 240 410, 360 360 C 470 318, 540 380, 600 360" />
                <path d="M60 420 C 160 380, 260 440, 380 400 C 490 364, 560 420, 600 400" />
                <path d="M0 340 C 120 300, 220 360, 340 320 C 450 286, 540 340, 600 320" />
              </g>
            </svg>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default AboutSection;
