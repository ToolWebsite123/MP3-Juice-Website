import { useEffect } from 'react';

/**
 * Reusable component to dynamically manage page titles and meta descriptions for SEO
 */
export default function SEO({ title, description, keywords }) {
  useEffect(() => {
    // Set document title
    const defaultTitle = "MP3Juice - Free MP3 Music Downloads & YouTube Converter";
    document.title = title ? `${title} - MP3Juice` : defaultTitle;

    // Set meta description
    const defaultDescription = "MP3Juice is a free online MP3 search engine and YouTube converter. Search, stream, and download high-quality MP3 audio and MP4 video fast and free.";
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description || defaultDescription;

    // Set meta keywords
    if (keywords) {
      let metaKeywords = document.querySelector('meta[name="keywords"]');
      if (!metaKeywords) {
        metaKeywords = document.createElement('meta');
        metaKeywords.name = 'keywords';
        document.head.appendChild(metaKeywords);
      }
      metaKeywords.content = keywords;
    }
  }, [title, description, keywords]);

  return null;
}
