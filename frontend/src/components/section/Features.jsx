
/* eslint-disable no-shadow-restricted-names */
import React from "react";
import { Infinity, ThumbsUp, Monitor, Gauge, Ban, Smartphone } from "lucide-react";

// Icons array
const icons = [Infinity, ThumbsUp, Monitor, Gauge, Ban, Smartphone];

export default function Features() {
  const features = [
    { title: "Unlimited Downloads", description: "Download as many videos as you want without any restrictions." },
    { title: "High Quality", description: "Get the best quality MP3 and MP4 files for your downloads." },
    { title: "Fast Processing", description: "Quick and efficient video conversion and download process." },
    { title: "Multiple Formats", description: "Choose from various audio and video formats and quality options." },
    { title: "No Registration", description: "Start downloading immediately without creating an account." },
    { title: "Mobile Friendly", description: "Works perfectly on all devices including smartphones and tablets." }
  ];

  return (
    <div className="w-full py-8 sm:py-12 md:py-16 px-4 sm:px-6">
      <div className="max-w-[890px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-12 text-center">
        {features.map(({ title, description }, index) => {
          const Icon = icons[index % icons.length]; // prevent crash
          return (
            <div key={index} className="p-2 sm:p-[10px]">
              <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-gray-700 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-bold text-[#a4161a] mb-2">{title}</h3>
              <p className="text-[#000814] text-xs sm:text-sm leading-relaxed">{description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
