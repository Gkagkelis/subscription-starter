/**
 * Noraya RSS Feed Configuration
 * All verified and working RSS feeds for Greek political news.
 */

export interface FeedSource {
  name: string;
  feedUrl: string;
  category: "broadsheet" | "business" | "portal" | "alternative" | "tv";
  politicalLeaning?: "center-right" | "center" | "center-left" | "left" | "independent";
}

export const RSS_FEEDS: FeedSource[] = [
  {
    name: "Καθημερινή",
    feedUrl: "https://feeds.feedburner.com/kathimerini/DJpy",
    category: "broadsheet",
    politicalLeaning: "center-right",
  },
  {
    name: "Τα Νέα",
    feedUrl: "https://www.tanea.gr/feed/",
    category: "broadsheet",
    politicalLeaning: "center",
  },
  {
    name: "Το Βήμα",
    feedUrl: "https://www.tovima.gr/feed/",
    category: "broadsheet",
    politicalLeaning: "center",
  },
  {
    name: "Αυγή",
    feedUrl: "https://www.avgi.gr/rss.xml",
    category: "broadsheet",
    politicalLeaning: "left",
  },
  {
    name: "Εφ.Συν.",
    feedUrl: "https://www.efsyn.gr/rss.xml",
    category: "broadsheet",
    politicalLeaning: "center-left",
  },
  {
    name: "Euro2day",
    feedUrl: "https://www.euro2day.gr/rss/news.xml",
    category: "business",
    politicalLeaning: "center",
  },
  {
    name: "Protothema",
    feedUrl: "https://www.protothema.gr/feed/",
    category: "portal",
    politicalLeaning: "center-right",
  },
  {
    name: "Newsbomb",
    feedUrl: "https://www.newsbomb.gr/feed",
    category: "portal",
    politicalLeaning: "center",
  },
  {
    name: "Ethnos",
    feedUrl: "https://www.ethnos.gr/feed",
    category: "portal",
    politicalLeaning: "center",
  },
  {
    name: "Documento",
    feedUrl: "https://www.documentonews.gr/feed/",
    category: "alternative",
    politicalLeaning: "left",
  },
  {
    name: "Kontra News",
    feedUrl: "https://www.kontranews.gr/feed",
    category: "alternative",
    politicalLeaning: "left",
  },
  {
    name: "SKAI",
    feedUrl: "https://www.skai.gr/rss/news",
    category: "tv",
    politicalLeaning: "center-right",
  },
];
