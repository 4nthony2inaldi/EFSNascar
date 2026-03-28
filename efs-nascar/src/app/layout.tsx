import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EFS NASCAR Fantasy League",
  description: "17-team fantasy NASCAR league with automated scoring and standings",
  icons: {
    icon: "/Logo.svg",
    shortcut: "/Logo.svg",
    apple: "/Logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
