import React from "react";
import { Link } from "react-router-dom";
import SocialShareWidget from "../components/home/SocialShareWidget";
import HomeFooter from "../components/home/HomeFooter";

export default function Contact() {
  return (
    <div className="min-h-screen bg-[#1676C2] flex flex-col relative">
      {/* Social Share Widget - Fixed on left side */}
      <SocialShareWidget />

      {/* MP3 Juice Style Header */}
      <div className="bg-[#1676C2] w-full">
        {/* Top Navigation */}
        <nav className="w-full py-4 sm:py-6">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
              <Link to="/" className="text-white hover:opacity-80 text-sm sm:text-base font-medium">
                Home
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

        {/* Waveform Graphic and Logo */}
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
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white text-center mb-8">
              Mp<sup className="text-2xl sm:text-3xl md:text-4xl font-bold">3</sup>Juice
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content - Contact Section */}
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Contact Heading */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-6">
            Contact
          </h1>

          {/* Contact Instructions */}
          <div className="text-white space-y-6 text-base sm:text-lg leading-relaxed text-center">
            <p>
              if you have a question or want to report any error write to email us. keep in mind the below note before writing an email
            </p>

            {/* Numbered Instructions */}
            <ol className="list-decimal list-inside space-y-3 text-left max-w-2xl mx-auto">
              <li>Write Email-only in the English Language</li>
              <li>Describe in depth Any Query and Suggestions,</li>
            </ol>

            {/* Additional Note */}
            <p className="mt-6">
              Before Sending Email Check our listed question and answer on this page -{" "}
              <Link to="/faq" className="underline hover:opacity-80 font-semibold">
                FAQ
              </Link>
            </p>

            {/* Thanks */}
            <p className="mt-8 text-xl font-semibold">
              Thanks
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <HomeFooter />
    </div>
  );
}
