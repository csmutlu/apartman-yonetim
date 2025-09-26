import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

const PageContentContext = createContext();

export const PageContentProvider = ({ children }) => {
  const [pageContent, setPageContent] = useState({});
  const [globalData, setGlobalData] = useState({});
  const location = useLocation();

  const savePageContent = (path, content) => {
    setPageContent((prev) => ({
      ...prev,
      [path]: content,
    }));
  };

  const addGlobalData = (key, data) => {
    setGlobalData((prev) => ({
      ...prev,
      [key]: data,
    }));
  };

  useEffect(() => {
    const capturePageContent = () => {
      try {
        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
          const textContent = mainContent.innerText;
          savePageContent(location.pathname, {
            text: textContent,
            title: document.title,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error("Sayfa içeriği alınırken hata:", error);
      }
    };

    window.setTimeout(capturePageContent, 1000);
  }, [location.pathname]);

  return (
    <PageContentContext.Provider
      value={{
        pageContent,
        savePageContent,
        globalData,
        addGlobalData,
        currentPath: location.pathname,
      }}
    >
      {children}
    </PageContentContext.Provider>
  );
};

export const usePageContent = () => useContext(PageContentContext);
