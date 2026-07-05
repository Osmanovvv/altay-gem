import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

interface LayoutProps {
  children: ReactNode;
  cartCount?: number;
}

export function Layout({ children, cartCount = 0 }: LayoutProps) {
  return (
    <div id="top" style={{ backgroundColor: "var(--color-bg-cream)", minHeight: "100vh" }}>
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

export default Layout;
