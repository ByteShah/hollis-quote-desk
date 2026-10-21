import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Quote Desk", template: "%s · Quote Desk" },
  description: "Draft quotes from customer enquiries, reviewed by a person before anything is sent.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f6f5f1" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        {children}
        <Toaster position="bottom-right" toastOptions={{ className: "!rounded-xl !border-line !font-sans" }} />
      </body>
    </html>
  );
}
