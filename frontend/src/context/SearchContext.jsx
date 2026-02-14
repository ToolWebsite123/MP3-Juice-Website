/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback } from "react";

const SearchContext = createContext();

export function SearchProvider({ children }) {
  const [query, setQueryState] = useState("");
  const [searchType, setSearchTypeState] = useState(""); // "query" or "url"

  // ✅ Set query
  const setQuery = useCallback((newQuery) => {
    setQueryState(newQuery);
  }, []);

  // ✅ Set search type
  const setSearchType = useCallback((type) => {
    setSearchTypeState(type);
  }, []);

  // ✅ Clear all search data
  const clearSearch = useCallback(() => {
    setQueryState("");
    setSearchTypeState("");
  }, []);

  const value = {
    query,
    searchType,
    setQuery,
    setSearchType,
    clearSearch,
  };

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
}

export const useSearch = () => {
  const context = useContext(SearchContext);
  
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  
  return context;
};

export default SearchContext;