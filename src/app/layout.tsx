import type { Metadata, Viewport } from "next";
import { CartProvider } from "@/components/CartProvider";
import { AppChrome } from "@/components/AppChrome";
import { getSession } from "@/lib/auth";
import { getSiteContent } from "@/lib/site-content";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mobile Dinners: Food Delivery at In-Store Prices",
  description:
    "Order from local restaurants at in-store prices. No service fees, one points wallet that works everywhere.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  // Header and footer copy is editable at /ops/content; read once per request
  // here rather than in both components.
  const content = getSiteContent();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
        <link rel="preconnect" href="https://www.themealdb.com" />
      </head>
      <body>
        <CartProvider>
          <AppChrome session={session} content={content}>
            {children}
          </AppChrome>
        </CartProvider>
      </body>
    </html>
  );
}
