import type { Metadata } from "next";
import Link from "next/link";
import { WebNavigationProvider } from "@/lib/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "シャドーイング練習アプリ",
  description: "個人使用向けの英語シャドーイング練習アプリケーション",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-[#f5f5f5] text-[#333] font-sans antialiased">
        <header className="bg-[#2c3e50] text-white px-6 py-4 flex justify-between items-center shadow">
          <h1 className="text-xl font-light">
            <Link href="/">シャドーイング練習アプリ</Link>
          </h1>
          <nav className="flex gap-4">
            <Link
              href="/"
              className="px-4 py-2 rounded border-2 border-white/30 hover:border-white/60 transition"
            >
              課題管理
            </Link>
            <Link
              href="/settings"
              className="px-4 py-2 rounded border-2 border-white/30 hover:border-white/60 transition"
            >
              設定
            </Link>
          </nav>
        </header>
        <WebNavigationProvider>
          <main className="max-w-6xl mx-auto p-8">{children}</main>
        </WebNavigationProvider>
      </body>
    </html>
  );
}
