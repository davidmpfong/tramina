import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NavigateAI",
  description: "Multilingual AI platform for grants, loans, and benefits"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
