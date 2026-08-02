import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { HeaderNav } from "@/components/header-nav";
import { SiteFooter } from "@/components/site-footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AUSSurveillance Intelligence",
  description:
    "Enterprise physical security risk intelligence platform for insurers, integrators, and multi-site operators.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-white">
        <div className="relative min-h-screen">
          <div className="absolute inset-x-0 top-0 -z-10 h-[600px] bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_55%)]" />
          <div className="absolute right-0 top-24 -z-10 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
          <HeaderNav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
