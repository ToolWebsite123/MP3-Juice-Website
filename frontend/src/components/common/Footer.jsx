import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="w-full py-4 sm:py-6">
      <div className="max-w-[890px] mx-auto text-center space-y-3 sm:space-y-4 px-4">

        {/* CopyRight Text - Responsive */}
        <p className="text-[#000814] text-xs sm:text-sm">
          © 2025 <span className="font-semibold">MP3Juice</span>
        </p>

        {/* Links - Responsive */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-0 sm:space-x-6 text-xs sm:text-sm text-[#000814]">
          <Link to="/About" className="hover:text-red-600 px-1">
            About
          </Link>
          <span className="hidden sm:inline">·</span>
          <Link to="/Contact" className="hover:text-[#a4161a] px-1">
            Contact
          </Link>
          <span className="hidden sm:inline">·</span>
          <Link to="/Terms" className="hover:text-[#a4161a] px-1">
            Terms
          </Link>
          <span className="hidden sm:inline">·</span>
          <Link to="/Privacy" className="hover:text-[#a4161a] px-1">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
