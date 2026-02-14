import React from "react";
import { Link } from "react-router-dom";
import SocialShareWidget from "../components/home/SocialShareWidget";
import HomeFooter from "../components/home/HomeFooter";

export default function DMCA() {
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

      {/* Main Content - DMCA Policy */}
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* DMCA Policy Heading */}
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mb-8">
            DMCA policy
          </h1>

          {/* Policy Content */}
          <div className="text-white space-y-6 text-base sm:text-lg leading-relaxed">
            {/* Introduction */}
            <div>
              <p>
                This Digital Millennium Copyright Act policy ("Policy") applies to the{" "}
                <span className="font-semibold">mp3juices.link</span> website ("Website" or "Service")
                and any of its related products and services (collectively, "Services") and outlines
                how this Website operator ("Operator", "we", "us" or "our") addresses copyright
                infringement notifications and how you ("you" or "your") may submit a copyright
                infringement complaint.
              </p>
              <p className="mt-4">
                Protection of intellectual property is of utmost importance to us and we ask our users
                and their authorized agents to do the same. It is our policy to expeditiously respond
                to clear notifications of alleged copyright infringement that comply with the United
                States Digital Millennium Copyright Act ("DMCA") of 1998, the text of which can be
                found at the U.S. Copyright Office website.
              </p>
            </div>

            {/* Table of Contents */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Table of contents</h2>
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>What to consider before submitting a copyright complaint</li>
                <li>Notifications of infringement</li>
                <li>Changes and amendments</li>
                <li>Reporting copyright infringement</li>
              </ol>
            </div>

            {/* Section 1 */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                What to consider before submitting a copyright complaint
              </h2>
              <p>
                Please note that if you are unsure whether the material you are reporting is in fact
                infringing, you may wish to contact an attorney before filing a notification with us.
              </p>
              <p className="mt-4">
                The DMCA requires you to provide your personal information in the copyright
                infringement notification. If you are concerned about the privacy of your personal
                information, you may wish to hire an agent to report infringing material for you.
              </p>
            </div>

            {/* Section 2 */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Notifications of infringement
              </h2>
              <p>
                If you are a copyright owner or an agent thereof, and you believe that any material
                available on our Services infringes your copyrights, then you may submit a written
                copyright infringement notification ("Notification") using the contact details below
                pursuant to the DMCA. All such Notifications must comply with the DMCA requirements.
              </p>
              <p className="mt-4">
                Filing a DMCA complaint is the start of a pre-defined legal process. Your complaint
                will be reviewed for accuracy, validity, and completeness. If your complaint has
                satisfied these requirements, our response may include the removal or restriction of
                access to allegedly infringing material.
              </p>
              <p className="mt-4">
                If we remove or restrict access to materials or terminate an account in response to
                a Notification of alleged infringement, we will make a good faith effort to contact
                the affected user with information concerning the removal or restriction of access,
                which may include a full copy of your Notification (including your name, address,
                phone, and email address), along with instructions for filing a counter-notification.
              </p>
              <p className="mt-4">
                Notwithstanding any other provision of this Policy, the Operator reserves the right
                to take no action upon receipt of a DMCA copyright infringement notification if it
                fails to comply with all the requirements of the DMCA for such notifications.
              </p>
              <p className="mt-4">
                The process described in this Policy does not limit our ability to pursue any other
                remedies we may have to address suspected infringement.
              </p>
            </div>

            {/* Section 3 */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Changes and amendments
              </h2>
              <p>
                We reserve the right to modify this Policy or its terms related to the Website and
                Services at any time at our discretion. When we do, we will revise the updated date
                at the bottom of this page, post a notification on the main page of the Website, send
                you an email to notify you. We may also provide notice to you in other ways at our
                discretion, such as through the contact information you have provided.
              </p>
              <p className="mt-4">
                An updated version of this Policy will be effective immediately upon the posting of
                the revised Policy unless otherwise specified. Your continued use of the Website and
                Services after the effective date of the revised Policy (or such other act specified
                at that time) will constitute your consent to those changes.
              </p>
            </div>

            {/* Section 4 */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Reporting copyright infringement
              </h2>
              <p>
                If you would like to notify us of the infringing material or activity, you may send
                an email to the address below or contact us using the contact form at{" "}
                <Link to="/contact" className="underline hover:opacity-80">
                  https://mp3juice.za.com/contact.php
                </Link>
                .
              </p>
            </div>

            {/* Last Updated */}
            <div className="mt-8 pt-4 border-t border-white/20">
              <p className="text-sm">
                This document was last updated on October 3, 2023
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <HomeFooter />
    </div>
  );
}


