// src/components/common/Spinner.jsx
import React from "react";

export default function Spinner() {
  return (
    <div className="flex justify-center items-center mt-3">
      <div className="relative w-10 h-10">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="absolute block w-2 h-2 bg-[#a4161a] rounded-full animate-spinner"
            style={{
              top: "50%",
              left: "50%",
              transform: `rotate(${i * 30}deg) translate(16px)`,
              animationDelay: `${i * 0.1}s`,
            }}
          ></span>
        ))}
      </div>

      {/* 🔹 Spinner Animation CSS */}
      <style>
        {`
          @keyframes spinner {
            0%, 20%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.4); }
          }

          .animate-spinner span {
            animation: spinner 1.2s linear infinite;
          }
        `}
      </style>
    </div>
  );
}
