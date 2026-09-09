import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "talk2me — private conversations",
  description: "A calmer place to talk with your people."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
