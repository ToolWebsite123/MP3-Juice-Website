import React from "react";
import { Link } from "react-router-dom";
import SocialShareWidget from "../components/home/SocialShareWidget";
import HomeFooter from "../components/home/HomeFooter";
import SEO from "../components/common/SEO";

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#1676C2] flex flex-col relative">
      <SEO 
        title="Terms of Service - MP3Juice"
        description="Read the Terms of Service for using MP3Juice online music search engine and download utilities."
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
            Terms of Service
          </h1>

          <div className="text-white space-y-6 text-base sm:text-lg leading-relaxed">
            <p>
              By accessing and using <strong>MP3Juice</strong> ("Website" or "Service"), you agree to comply with and be bound by the following terms and conditions of use.
            </p>

            <h2 className="text-2xl sm:text-3xl font-bold mt-6 mb-4">1. Use of Service</h2>
            <p>
              MP3Juice provides search engine and file management utilities for personal, non-commercial use. Users are responsible for ensuring their use of the Service complies with local laws and intellectual property regulations in their jurisdiction.
            </p>

            <h2 className="text-2xl sm:text-3xl font-bold mt-6 mb-4">2. Intellectual Property Rights</h2>
            <p>
              We do not host or store copyrighted material on our servers. All media search results are retrieved dynamically. Users are solely responsible for ensuring they have the rights or permissions required to access any content.
            </p>

            <h2 className="text-2xl sm:text-3xl font-bold mt-6 mb-4">3. Disclaimer of Warranties</h2>
            <p>
              The Service is provided on an "AS IS" and "AS AVAILABLE" basis. MP3Juice makes no representations or warranties of any kind, express or implied, regarding the operation or availability of the Service.
            </p>

            <h2 className="text-2xl sm:text-3xl font-bold mt-6 mb-4">4. Limitation of Liability</h2>
            <p>
              In no event shall MP3Juice or its operators be liable for any damages arising out of the use or inability to use the materials on the Website.
            </p>

            <h2 className="text-2xl sm:text-3xl font-bold mt-6 mb-4">5. Contact Information</h2>
            <p>
              If you have any questions regarding these Terms, please contact us at our{" "}
              <Link to="/contact" className="underline hover:opacity-80">
                Contact Page
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
