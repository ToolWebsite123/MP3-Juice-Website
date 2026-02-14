import React from "react";
import { Link } from "react-router-dom";

export default function Navbar() {

  return (
    <nav className="w-full bg-[#f9f9f9] shadow-sm relative">
      <div className="max-w-[890px] h-[56px] sm:h-[66px] mx-auto flex items-center justify-between px-4 sm:px-0">
        {/* Logo - Responsive */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          <Link to="/">
            <img src="/logo.webp" alt="logo" className="w-[36px] h-[36px] sm:w-[46px] sm:h-[46px]" />
          </Link>
          <Link
            to="/"
            className="text-base sm:text-[20px] font-bold text-[#000814] mr-2 sm:mr-[20px]"
          >
            MP3Juice
          </Link>
        </div>

      </div>
    </nav>
  );
}
