/**
 * Тип категории витрины. Данные приходят из API (/api/v1/categories,
 * см. src/lib/api.ts: toCategory -> FrontCategory) — моки удалены на шаге 9.
 */
import type { LucideIcon } from "lucide-react";

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: LucideIcon;
  description: string;
  subcategories: string[];
  gradient: string;
  image: string;
  imageAlt: string;
}
