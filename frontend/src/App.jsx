import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

// ✅ Pages
import Home from "./pages/Home";
import Contact from "./pages/Contact";
import DMCA from "./pages/DMCA";
import Privacy from "./pages/Privacy";
import Downloader from "./pages/Downloader";
import ConvertPage from "./pages/ConvertPage";
import SearchResults from "./pages/SearchResult";
import VideoPlayerPage from "./pages/VideoPlayerPage";

// ✅ Layout
import Layout from "./layout/Layout";

// ✅ Context Providers
import { SearchProvider } from "./context/SearchContext";

function App() {
  return (
    <Router>
      <SearchProvider>
          <Routes>
            {/* Video Player Page - Outside Layout (has its own navigation) */}
            <Route path="/play" element={<VideoPlayerPage />} />
            
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              {/* ✅ FIXED: Clean URLs - ab query parameters nahi dikhenge */}
              <Route path="/search" element={<SearchResults />} />
              <Route path="/download" element={<Downloader />} />
              <Route path="/convert" element={<ConvertPage />} />
              <Route path="/downloader" element={<Downloader />} />
           
              <Route path="/faq" element={<Contact />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/dmca" element={<DMCA />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </SearchProvider>
    </Router>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-[#a4161a] mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">
          Page Not Found
        </h2>
        <p className="text-gray-600 mb-6">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            to="/"
            className="px-6 py-3 bg-gradient-to-r from-[#a4161a] to-[#800000] text-white rounded-lg hover:from-[#800000] hover:to-[#660000] transition-all font-medium shadow-lg"
          >
            Go Home
          </Link>
          <Link
            to="/search"
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all font-medium shadow-lg"
          >
            Search Videos
          </Link>
        </div>
      </div>
    </div>
  );
}

export default App;