import React from "react";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-[#F6F8FA]">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
