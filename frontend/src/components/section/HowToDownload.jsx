
import React from "react";
export default function HowToDownload() {
  return (
    <div className="w-full bg-gray-50 py-6 sm:py-8 md:py-[30px]">
      <div className="max-w-[840px] mx-auto text-center px-4 sm:px-6">
        {/* Main Heading - Responsive */}
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#000814] mb-4 sm:mb-6">
          How to Download Videos
        </h2>

        {/* Intro Text - Responsive */}
        <p className="text-gray-700 text-sm sm:text-base leading-relaxed mb-2 sm:mb-[10px]">
          MP3Juice makes it easy to download and convert YouTube videos to MP3 or MP4 format.
        </p>
        <p className="text-gray-700 text-sm sm:text-base leading-relaxed mb-6 sm:mb-10">
          Follow these simple steps to get started.
        </p>
      </div>

      {/* Two Columns - Responsive */}
      <div className="max-w-[840px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 md:gap-10 text-left py-6 sm:py-8 md:py-[30px] px-4 sm:px-6">
        {/* Left Column */}
        <div className="px-2 sm:px-[15px]">
          <h3 className="text-sm sm:text-base md:text-[16px] my-2 sm:my-[6px] font-bold text-[#000814]">
            How to Download
          </h3>
          <ol className="list-decimal list-inside text-gray-700 space-y-2 pl-2 sm:pl-[16px] text-sm sm:text-base">
            <li>Search for a video using keywords or paste a YouTube URL</li>
            <li>Click on MP3 or MP4 button to select your preferred format</li>
            <li>Choose the quality and click download</li>
          </ol>
        </div>

        {/* Right Column */}
        <div className="px-2 sm:px-0">
          <h3 className="text-lg sm:text-xl font-semibold text-[#000814] mb-3 sm:mb-4">
            Advantages
          </h3>
          <ul className="list-disc list-inside text-gray-700 space-y-2 text-sm sm:text-base">
            <li>Fast and reliable downloads</li>
            <li>Multiple quality options available</li>
            <li>No registration required</li>
            <li>Works on all devices</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

