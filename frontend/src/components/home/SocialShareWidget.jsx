import React from "react";
import { FaFacebook, FaTwitter, FaWhatsapp, FaPinterest, FaTelegram, FaEnvelope } from "react-icons/fa";

export default function SocialShareWidget() {
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = "Check out MP3Juice - Free Music Downloads";

  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`,
    pinterest: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&description=${encodeURIComponent(shareText)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
    email: `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(shareUrl)}`
  };

  return (
    <div className="fixed left-4 top-1/2 transform -translate-y-1/2 z-50 hidden lg:block">
      <div className="bg-white rounded-lg shadow-lg p-4 flex flex-col items-center space-y-3">
        <div className="text-gray-800 font-semibold text-sm mb-2">
          1.8k Shares
        </div>
        
        <a
          href={shareLinks.facebook}
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
          aria-label="Share on Facebook"
        >
          <FaFacebook className="text-lg" />
        </a>
        
        <a
          href={shareLinks.twitter}
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 bg-black rounded flex items-center justify-center text-white hover:bg-gray-800 transition-colors"
          aria-label="Share on X (Twitter)"
        >
          <FaTwitter className="text-lg" />
        </a>
        
        <a
          href={shareLinks.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 bg-green-500 rounded flex items-center justify-center text-white hover:bg-green-600 transition-colors"
          aria-label="Share on WhatsApp"
        >
          <FaWhatsapp className="text-lg" />
        </a>
        
        <a
          href={shareLinks.pinterest}
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 bg-red-600 rounded flex items-center justify-center text-white hover:bg-red-700 transition-colors"
          aria-label="Share on Pinterest"
        >
          <FaPinterest className="text-lg" />
        </a>
        
        <a
          href={shareLinks.telegram}
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 bg-blue-500 rounded flex items-center justify-center text-white hover:bg-blue-600 transition-colors"
          aria-label="Share on Telegram"
        >
          <FaTelegram className="text-lg" />
        </a>
        
        <a
          href={shareLinks.email}
          className="w-10 h-10 bg-red-500 rounded flex items-center justify-center text-white hover:bg-red-600 transition-colors"
          aria-label="Share via Email"
        >
          <FaEnvelope className="text-lg" />
        </a>
      </div>
    </div>
  );
}

