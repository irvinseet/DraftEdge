import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DraftEdge — FPL Draft waiver planner",
  description: "Rank FPL Draft waivers by expected points and optimise next week's lineup.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
