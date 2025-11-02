
export const WASTE_CATEGORIES = ["Giấy Tái Chế", "Nhựa Tái Chế", "Kim Loại Tái Chế", "Rác Hữu Cơ", "Rác Khác"] as const;

export type WasteCategory = typeof WASTE_CATEGORIES[number];

export interface WasteCategoryDetails {
  displayName: string;
  colorClasses: string;
  description: string;
  instructions: string;
}
