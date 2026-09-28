import React from "react";
import { Link } from "react-router-dom";
import SearchBar from "../components/search/SearchBar";
import SocialShareWidget from "../components/home/SocialShareWidget";
import HomeFooter from "../components/home/HomeFooter";
import SEO from "../components/common/SEO";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#1676C2] flex flex-col relative">
      <SEO 
        title="Privacy Policy - MP3Juice"
        description="MP3Juice Privacy Policy. Information regarding user data protection and privacy policies."
      />
      {/* Social Share Widget - Fixed on left side */}
      <SocialShareWidget />

      {/* MP3 Juice Style Header */}
      <div className="bg-[#1676C2] w-full">
        {/* Top Navigation */}
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
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white text-center mb-6">
              Mp<sup className="text-2xl sm:text-3xl md:text-4xl font-bold">3</sup>Juice
            </h1>

            {/* Search Bar */}
            <div className="mb-4">
              <SearchBar />
            </div>

            {/* Terms of Use */}
            <p className="text-white text-center text-sm mb-4">
              By pressing Search you confirm your consent to our{" "}
              <Link to="/dmca" className="underline hover:opacity-80">
                Terms of Use
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Main Title */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              MP3Juices - MP3 Juice Free Music Downloads
            </h2>
            <p className="text-base sm:text-lg text-white leading-relaxed">
              MP3Juice is a popular online platform that allows users to search for and download MP3 audio files from various sources, primarily YouTube. It provides a free service for converting YouTube videos into MP3 format, making it easy for users to access music and audio content.
            </p>
          </div>

          {/* What is MP3Juice? */}
          <section className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
              What is MP3Juice?
            </h2>
            <p className="text-base sm:text-lg text-white leading-relaxed">
              MP3Juice is a website for searching, streaming, and downloading MP3 music files. It provides a simple and easy-to-use interface that allows users to quickly find and download their favorite songs. However, users should consider various aspects when using such services, including legal, ethical, and security considerations.
            </p>
          </section>

          {/* Features of MP3 Juice */}
          <section className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
              Features of MP3 Juice
            </h2>
            
            {/* Search and Download */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Search and Download
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                MP3Juice functions as a search engine that provides direct download links for MP3 files. Users can search for songs by artist name, song title, or keywords, and then download the audio files directly to their devices.
              </p>
            </div>

            {/* Copyright Considerations */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Copyright Considerations
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                It's important to note that downloading copyrighted music without permission may violate copyright laws in many jurisdictions. Unauthorized downloads can infringe on intellectual property rights and may violate terms of service of content platforms.
              </p>
            </div>

            {/* Variety of Music */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Variety of Music
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                MP3Juice offers access to a wide range of music genres, artists, and time periods. However, track availability may vary, and some content may not be accessible due to regional restrictions or other factors.
              </p>
            </div>

            {/* Legal and Security Risks */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Legal and Security Risks
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                Users should be aware of potential legal and security risks when downloading from unverified sources. These risks may include exposure to malware, legal consequences for copyright infringement, and potential violations of terms of service.
              </p>
            </div>

            {/* Alternatives */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Alternatives
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                For users seeking legal and safe ways to access music, there are numerous legitimate alternatives available, including Spotify, Apple Music, Amazon Music, and other licensed streaming services. These platforms offer licensed content and support artists through proper channels.
              </p>
            </div>

            {/* Dynamic Landscape */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Dynamic Landscape
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                The online music service landscape is constantly evolving. Legal actions, policy changes, and other factors can impact the functionality and availability of such platforms. Users should stay informed about current legal and policy developments.
              </p>
            </div>

            {/* User Interface and Experience */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                User Interface and Experience
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                MP3Juice features a straightforward and easy-to-use interface that allows users to quickly search for and download music. The platform is designed to be accessible and user-friendly, requiring minimal technical knowledge.
              </p>
            </div>

            {/* Popularity and Community Usage */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Popularity and Community Usage
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                The platform's popularity is largely attributed to the desire for free access to music. It has a significant user base and is used by various communities. However, users should be mindful of legal and ethical considerations.
              </p>
            </div>

            {/* Responsibility and Ethics */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Responsibility and Ethics
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                It's important to consider ethical implications when using music download platforms. Supporting artists through legal channels helps ensure the continued production of quality music content and respects intellectual property rights.
              </p>
            </div>

            {/* Quality of Downloads */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Quality of Downloads
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                The quality of MP3 files can vary in terms of bitrates and sound quality. This contrasts with legal alternatives that typically offer consistent high-quality audio and support for various quality options.
              </p>
            </div>

            {/* Availability and Access Restrictions */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Availability and Access Restrictions
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                The availability of MP3Juice and similar platforms can be subject to geographical restrictions and internet regulations. Some regions may have blocks or restrictions that limit access to such services.
              </p>
            </div>

            {/* Educational Outreach */}
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">
                Educational Outreach
              </h3>
              <p className="text-base sm:text-lg text-white leading-relaxed">
                The music industry and various platforms engage in educational efforts to inform users about the impact of unauthorized downloading. Understanding copyright laws and respecting intellectual property is crucial for responsible use of music services.
              </p>
            </div>
          </section>

          {/* Conclusion */}
          <section className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
              Conclusion
            </h2>
            <p className="text-base sm:text-lg text-white leading-relaxed">
              MP3Juice represents an online platform for searching and downloading MP3 files, offering a vast library and user-friendly interface. However, the legal status of such platforms is uncertain due to third-party sources and varying local copyright laws. Users should exercise caution and use such services responsibly, considering legal, ethical, and security implications. Exploring legitimate alternatives can provide a safer and more sustainable way to enjoy music while supporting artists and the music industry.
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <HomeFooter />
    </div>
  );
}
