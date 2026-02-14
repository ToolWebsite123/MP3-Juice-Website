


// src/components/FAQ.jsx
import React from "react";

export default function FAQ() {
  const faqs = [
    {
      question: "What is MP3Juice?",
      answer: "MP3Juice is a free online tool that allows you to search, download, and convert YouTube videos to MP3 or MP4 format."
    },
    {
      question: "Is MP3Juice free to use?",
      answer: "Yes, MP3Juice is completely free to use. You can search and download videos without any cost."
    },
    {
      question: "How do I download a video?",
      answer: "Simply search for a video, click on the MP3 or MP4 button, select your preferred quality, and the download will start automatically."
    },
    {
      question: "What video formats are supported?",
      answer: "MP3Juice supports MP3 (audio) and MP4 (video) formats with various quality options."
    },
    {
      question: "Is it legal to download videos?",
      answer: "MP3Juice is for personal use only. Please respect copyright laws and only download content you have permission to use."
    }
  ];

  return (
    <div className="w-full py-8 sm:py-12 md:py-16 px-4 sm:px-6">
      <div className="max-w-[890px] mx-auto">
        <h2 className="text-xl sm:text-2xl font-bold text-[#000814] mb-6 sm:mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6 sm:space-y-8">
          {faqs.map((faq, index) => (
            <div key={index} className="px-2">
              <h3 className="text-base sm:text-lg font-semibold text-[#a4161a] mb-2">
                {faq.question}
              </h3>
              <p className="text-[#000810] text-xs sm:text-sm leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
