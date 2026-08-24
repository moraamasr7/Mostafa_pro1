import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairoFont = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "مطعم مصطفى الجزار | المنيو الذكي",
  description: "منيو مطعم مصطفى الجزار — اطلب أشهى سندوتشات واللحوم الطازجة واستلم من الفرع أو اطلب توصيل للمنزل",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-[family-name:var(--font-cairo)]">
        {children}
      </body>
    </html>
  );
}
