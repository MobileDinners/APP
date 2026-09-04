import type { Metadata, Viewport } from "next";
import { CartProvider } from "@/components/CartProvider";
import { AppChrome } from "@/components/AppChrome";
import { getSession } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mobile Dinners — Food delivery with 0% commission",
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
          <AppChrome session={session}>{children}</AppChrome>
        </CartProvider>
      </body>
    </html>
  );
}
