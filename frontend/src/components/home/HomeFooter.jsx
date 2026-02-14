import React from "react";
import { Link } from "react-router-dom";

export default function HomeFooter() {
  return (
    <footer className="w-full py-6 sm:py-8 bg-[#1676C2]">
      <div className="max-w-7xl mx-auto px-4 text-center">
        {/* Copyright */}
        <p className="text-white text-sm sm:text-base mb-4">
          © 2026 MP3Juice
        </p>
        
        {/* Footer Links */}
        <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-4 md:gap-6 text-white text-xs sm:text-sm">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            MP3 Juice
          </Link>
          <Link to="/contact" className="hover:opacity-80 transition-opacity">
            Contact
          </Link>
          <Link to="/dmca" className="hover:opacity-80 transition-opacity">
            Copyright Claims
          </Link>
          <Link to="/privacy" className="hover:opacity-80 transition-opacity">
            Privacy Policy
          </Link>
          <Link to="/dmca" className="hover:opacity-80 transition-opacity">
            SRA
          </Link>
          <Link to="/dmca" className="hover:opacity-80 transition-opacity">
            ToS
          </Link>
        </div>
      </div>
    </footer>
  );
}

