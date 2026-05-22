import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "General Dank Content Engine",
  description: "Cinematic omnipresence content from realtime founder activity.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
