import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import Footer from "../components/common/Footer";

export default function Layout() {
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const isSearchPage = location.pathname === "/search";
  const isContactPage = location.pathname === "/contact";
  const isFAQPage = location.pathname === "/faq";
  const isDMCAPage = location.pathname === "/dmca";
  const isPrivacyPage = location.pathname === "/privacy";
  // Hide Navbar on pages that have their own MP3 Juice headers
  const shouldShowNavbar = !isHomePage && !isSearchPage && !isContactPage && !isFAQPage && !isDMCAPage && !isPrivacyPage;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* 🔹 Top Navigation - Hidden on home page and pages with custom headers */}
      {shouldShowNavbar && <Navbar />}

      {/* 🔹 Page Content */}
      <main className="flex-grow">
        <Outlet />
      </main>

      {/* 🔹 Footer - Hidden on home page and pages with custom headers */}
      {shouldShowNavbar && <Footer />}
    </div>
  );
}