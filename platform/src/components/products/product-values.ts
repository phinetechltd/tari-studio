import { fromCents } from "@/lib/money";

/**
 * The product form's value shape and its pure helpers, kept out of the "use client"
 * form component so server pages can call them too. (Importing a function from a
 * client module into a server component renders it uncallable — the pages 500.)
 */

export interface ProductFormValues {
  id?: string;
  brandId: string;
  name: string;
  sku: string;
  description: string;
  price: string;
  category: string;
  unit: string;
  url: string;
  details: Array<{ name: string; value: string }>;
  trackStock: boolean;
  stockQty: string;
  lowStockAt: string;
  archived?: boolean;
  images: Array<{ id: string; url: string }>;
}

export function emptyProduct(brandId: string): ProductFormValues {
  return { brandId, name: "", sku: "", description: "", price: "", category: "", unit: "", url: "", details: [], trackStock: false, stockQty: "0", lowStockAt: "", images: [] };
}

export function priceText(cents: number | null): string {
  return cents === null ? "" : String(fromCents(cents));
}
