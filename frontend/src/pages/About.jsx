import React from "react";
import { Link } from "react-router-dom";
import SocialShareWidget from "../components/home/SocialShareWidget";
import HomeFooter from "../components/home/HomeFooter";
import SEO from "../components/common/SEO";

export default function About() {
  return (
    <div className="min-h-screen bg-[#1676C2] flex flex-col relative">
      <SEO 
        title="About Us - MP3Juice"
        description="Learn about MP3Juice - your trusted free online music search engine and MP3/MP4 audio converter."
      />
      {/* Social Share Widget */}
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
            <div className="border-t border-white/20 mt-4"></div>
          </div>
        </nav>

        {/* Logo Section */}
        <div className="flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-3xl">
            <div className="flex justify-center items-center mb-6 relative w-full">
              <div className="relative flex items-center">
                <div className="absolute left-1/2 transform -translate-x-1/2 w-80 sm:w-96 border-t border-white/50"></div>
                <div className="flex items-end gap-1.5 relative z-10">
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '18px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '28px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '22px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '32px' }}></div>
                  <div className="w-2 bg-white rounded-t" style={{ height: '48px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '32px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '22px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '28px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '18px' }}></div>
                </div>
              </div>
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white text-center mb-8">
              Mp<sup className="text-2xl sm:text-3xl md:text-4xl font-bold">3</sup>Juice
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mb-8">
            About MP3Juice
          </h1>

          <div className="text-white space-y-6 text-base sm:text-lg leading-relaxed">
            <p>
              Welcome to <strong>MP3Juice</strong>, your premier online music search engine and audio converter. Our platform is designed to provide users with a fast, intuitive, and efficient way to discover and stream music content.
            </p>

            <h2 className="text-2xl sm:text-3xl font-bold mt-6 mb-4">Our Mission</h2>
            <p>
              Our goal is to make audio accessibility seamless across all modern devices. Whether you are on desktop, tablet, or smartphone, MP3Juice delivers high-quality format options with zero hassle and no software installation required.
            </p>

            <h2 className="text-2xl sm:text-3xl font-bold mt-6 mb-4">Key Features</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Instant search across millions of tracks</li>
              <li>High-speed MP3 audio and MP4 video format support</li>
              <li>Clean, responsive interface optimized for all screens</li>
              <li>No registration or personal information needed</li>
            </ul>

            <h2 className="text-2xl sm:text-3xl font-bold mt-6 mb-4">Intellectual Property & Respect</h2>
            <p>
              MP3Juice respects the intellectual property rights of copyright holders. If you are a copyright owner and wish to request removal of specific search listings, please visit our{" "}
              <Link to="/dmca" className="underline hover:opacity-80">
                DMCA Page
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <HomeFooter />
    </div>
  );
}
