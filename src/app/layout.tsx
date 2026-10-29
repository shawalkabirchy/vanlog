import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geist";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VanLog — Keep your kitchen moving",
    template: "%s · VanLog",
  },
  description:
    "Equipment hours, maintenance schedules, and service records for mobile kitchens. A ConsoleLog Studio portfolio concept.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16725d",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
