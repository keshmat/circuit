import { getDb } from "./db";
import type { ImageMetadata } from "astro";

/**
 * Represents a tournament link in the navigation menu
 */
export interface TournamentLink {
  year: string;
  month: string;
  url: string;
  displayName: string;
  galleryUrl?: string;
}

/**
 * Gallery URL mappings for each tournament
 */
const GALLERY_URLS: Record<string, string> = {
  "2024-july": "https://photos.keshmat.org/gallery/Circuit%201",
  "2024-august": "https://photos.keshmat.org/gallery/Circuit%202",
  "2024-december": "https://photos.keshmat.org/gallery/Circuit%203",
  "2025-january": "https://photos.keshmat.org/gallery/Circuit%204",
  "2025-february": "https://photos.keshmat.org/gallery/Circuit%205",
  "2025-march": "https://photos.keshmat.org/gallery/Circuit%206",
  // Add more mappings as needed
};

/**
 * Converts a numeric month (01-12) to its lowercase name
 */
function getMonthName(month: string): string {
  const date = new Date(2000, parseInt(month) - 1); // Using year 2000 as a base
  return date.toLocaleString("en-US", { month: "long" }).toLowerCase();
}

/**
 * Raw date information from the database
 */
export interface TournamentDate {
  year: string;
  month: string;
  month_name: string;
}

/**
 * Gets all tournament data needed for navigation and URL generation
 * This includes both the URL parameters for routing and the display information for the UI
 */
export async function getTournamentNavigationData() {
  const db = await getDb();

  // Get unique year-month combinations from tournaments
  const dates = await db.all(`
    SELECT DISTINCT 
      strftime('%Y', date) as year,
      strftime('%m', date) as month
    FROM tournaments
    ORDER BY year DESC, month DESC
  `);

  return dates.map((t) => ({
    year: t.year,
    month: getMonthName(t.month),
  }));
}

/**
 * Gets tournament links for the navigation menu
 */
export async function getTournamentLinks(): Promise<TournamentLink[]> {
  const data = await getTournamentNavigationData();
  return data.map(({ year, month }) => {
    const key = `${year}-${month}`;
    return {
      year,
      month,
      url: `/tournaments/${year}/${month}`,
      displayName: `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`,
      galleryUrl: GALLERY_URLS[key],
    };
  });
}

/**
 * Gets static paths for Astro's static site generation
 */
export async function getStaticPathsForTournaments() {
  const data = await getTournamentNavigationData();
  return data.map(({ year, month }) => ({
    params: {
      year,
      month,
    },
    props: { year, month },
  }));
}

/**
 * Dynamically imports all tournament card images
 */
export async function getTournamentCardImages() {
  const data = await getTournamentNavigationData();
  const imageImports: Record<string, Promise<{ default: ImageMetadata }>> = {};

  for (const { year, month } of data) {
    const key = `${year}-${month}`;
    try {
      // Dynamically import the image
      imageImports[key] = import(`../assets/${year}-${month}/card.jpg`);
    } catch (error) {
      console.warn(`Could not import card image for ${key}`);
    }
  }

  // Wait for all imports to complete
  const resolvedImages: Record<string, ImageMetadata> = {};
  for (const [key, importPromise] of Object.entries(imageImports)) {
    try {
      const module = await importPromise;
      resolvedImages[key] = module.default;
    } catch (error) {
      console.warn(`Failed to resolve image for ${key}`);
    }
  }

  return resolvedImages;
}
