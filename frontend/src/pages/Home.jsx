import React from "react";
import { Link } from "react-router-dom";
import SearchBar from "../components/search/SearchBar";
import HomeInfoContent from "../components/home/HomeInfoContent";
import SocialShareWidget from "../components/home/SocialShareWidget";
import HomeFooter from "../components/home/HomeFooter";
import SEO from "../components/common/SEO";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#1676C2] flex flex-col relative">
      <SEO 
        title="MP3Juice - Free MP3 Music Downloads & YouTube Converter"
        description="Search, stream, and download free MP3 music and MP4 videos instantly with MP3Juice. Fast, clean, and free audio converter."
        keywords="mp3 juice, mp3juices, free mp3 download, youtube to mp3, music downloader, audio converter"
      />
      {/* Social Share Widget - Fixed on left side */}
      <SocialShareWidget />

      {/* 🔹 Top Navigation */}
      <nav className="w-full py-4 sm:py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
            <Link to="/" className="text-white hover:opacity-80 text-sm sm:text-base font-medium">
              MP3Juice
            </Link>
            <Link to="/faq" className="text-white hover:opacity-80 text-sm sm:text-base font-medium">
              FAQ
            </Link>
            <Link to="/dmca" className="text-white hover:opacity-80 text-sm sm:text-base font-medium">
              DMCA
            </Link>
            <Link to="/contact" className="text-white hover:opacity-80 text-sm sm:text-base font-medium">
              Contact
            </Link>
          </div>
          {/* Horizontal Line Separator */}
          <div className="border-t border-white/20 mt-4"></div>
        </div>
      </nav>

      {/* 🔹 Centered Search Bar */}
      <div className="flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl">
          {/* Waveform Graphic - Audio Equalizer Style */}
          <div className="flex justify-center items-center mb-6 relative w-full">
            <div className="relative flex items-center">
              {/* Horizontal line extending from both sides */}
              <div className="absolute left-1/2 transform -translate-x-1/2 w-80 sm:w-96 border-t border-white/50"></div>
              
              {/* Vertical bars */}
              <div className="flex items-end gap-1.5 relative z-10">
                {/* Left side bars */}
                <div className="w-1.5 bg-white rounded-t" style={{ height: '18px' }}></div>
                <div className="w-1.5 bg-white rounded-t" style={{ height: '28px' }}></div>
                <div className="w-1.5 bg-white rounded-t" style={{ height: '22px' }}></div>
                <div className="w-1.5 bg-white rounded-t" style={{ height: '32px' }}></div>
                {/* Central peak */}
                <div className="w-2 bg-white rounded-t" style={{ height: '48px' }}></div>
                {/* Right side bars */}
                <div className="w-1.5 bg-white rounded-t" style={{ height: '32px' }}></div>
                <div className="w-1.5 bg-white rounded-t" style={{ height: '22px' }}></div>
                <div className="w-1.5 bg-white rounded-t" style={{ height: '28px' }}></div>
                <div className="w-1.5 bg-white rounded-t" style={{ height: '18px' }}></div>
              </div>
            </div>
          </div>
          
          {/* Logo Text with superscript 3 */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white text-center mb-10">
            Mp<sup className="text-2xl sm:text-3xl md:text-4xl font-bold">3</sup>Juice
          </h1>
          
          <SearchBar />
        </div>
      </div>

      {/* 🔹 Informational Content */}
      <HomeInfoContent />

      {/* 🔹 Footer */}
      <HomeFooter />
    </div>
  );
}