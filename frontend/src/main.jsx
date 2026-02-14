// ✅ FINAL FIXED - main.jsx (StrictMode Removed for Production)
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/index.css";

// ✅ CRITICAL FIX: StrictMode removed to prevent double mounting
// StrictMode causes components to mount twice in development
// This was causing the repeated fetch issue
ReactDOM.createRoot(document.getElementById("root")).render(
  <App />
);

/* 
🔍 Why StrictMode was removed:
- StrictMode intentionally double-invokes effects in development
- This caused ConvertPage to mount/unmount/mount rapidly
- Result: Multiple API calls and "Component unmounting" errors

⚠️ For Development with StrictMode (if you want to keep it):
Uncomment below and use the AbortController version of ConvertPage

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
*/