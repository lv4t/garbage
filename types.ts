

export const WASTE_CATEGORIES = ["Giấy Tái Chế", "Nhựa Tái Chế", "Kim Loại Tái Chế", "Rác Hữu Cơ", "Rác Khác"] as const;

export type WasteCategory = typeof WASTE_CATEGORIES[number];

export interface WasteCategoryDetails {
  displayName: string;
  colorClasses: string;
  description: string;
  instructions: string;
  flashColor: string;
}

export interface ClassificationHistoryItem {
  id: string; // Unique identifier for the item
  image: string; // Base64 encoded image dataURL
  category: WasteCategory;
  timestamp: string; // ISO 8601 string
}