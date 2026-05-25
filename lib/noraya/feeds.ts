/**
 * NORAYA — Complete RSS Feed Configuration
 * 29 sources: Greek media, news agencies, international, institutional
 */

export interface FeedSource {
  name: string;
  feedUrl: string;
  category: "broadsheet" | "business" | "portal" | "alternative" | "tv" | "agency" | "international" | "institutional";
  language: "el" | "en";
}

export const RSS_FEEDS: FeedSource[] = [
  // ═══ ΕΛΛΗΝΙΚΑ ΜΜΕ — Εφημερίδες ═══
  { name: "Καθημερινή", feedUrl: "https://feeds.feedburner.com/kathimerini/DJpy", category: "broadsheet", language: "el" },
  { name: "Τα Νέα", feedUrl: "https://www.tanea.gr/feed/", category: "broadsheet", language: "el" },
  { name: "Το Βήμα", feedUrl: "https://www.tovima.gr/feed/", category: "broadsheet", language: "el" },
  { name: "Αυγή", feedUrl: "https://www.avgi.gr/rss.xml", category: "broadsheet", language: "el" },
  { name: "Εφ.Συν.", feedUrl: "https://www.efsyn.gr/rss.xml", category: "broadsheet", language: "el" },
  { name: "Documento", feedUrl: "https://www.documentonews.gr/feed/", category: "alternative", language: "el" },
  { name: "Kontra News", feedUrl: "https://www.kontranews.gr/feed", category: "alternative", language: "el" },

  // ═══ ΕΛΛΗΝΙΚΑ ΜΜΕ — Portals ═══
  { name: "News247", feedUrl: "https://www.news247.gr/feed", category: "portal", language: "el" },
  { name: "Newsbeast", feedUrl: "https://www.newsbeast.gr/feed", category: "portal", language: "el" },
  { name: "News.gr", feedUrl: "https://www.news.gr/feed", category: "portal", language: "el" },

  // ═══ ΕΛΛΗΝΙΚΑ ΜΜΕ — Ανεξάρτητα ═══
  { name: "ThePressProject", feedUrl: "https://thepressproject.gr/feed/", category: "alternative", language: "el" },
  { name: "TVXS", feedUrl: "https://tvxs.gr/feed", category: "alternative", language: "el" },

  // ═══ ΠΡΑΚΤΟΡΕΙΑ ΕΙΔΗΣΕΩΝ ═══
  { name: "Reuters Europe", feedUrl: "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best", category: "agency", language: "en" },
  { name: "AP News World", feedUrl: "https://rsshub.app/apnews/topics/world-news", category: "agency", language: "en" },

  // ═══ ΔΙΕΘΝΗ ΜΜΕ ═══
  { name: "BBC Europe", feedUrl: "https://feeds.bbci.co.uk/news/world/europe/rss.xml", category: "international", language: "en" },
  { name: "Guardian Europe", feedUrl: "https://www.theguardian.com/world/europe-news/rss", category: "international", language: "en" },
  { name: "Politico EU", feedUrl: "https://www.politico.eu/feed/", category: "international", language: "en" },
  { name: "Euronews", feedUrl: "https://www.euronews.com/rss", category: "international", language: "en" },
  { name: "Ekathimerini EN", feedUrl: "https://www.ekathimerini.com/rss", category: "international", language: "en" },

  // ═══ ΘΕΣΜΙΚΑ ═══
  { name: "Βουλή RSS", feedUrl: "https://www.hellenicparliament.gr/rss/hppress.xml", category: "institutional", language: "el" },
  { name: "Ευρωκοινοβούλιο", feedUrl: "https://www.europarl.europa.eu/rss/doc/top-stories/el.xml", category: "institutional", language: "el" },
];
