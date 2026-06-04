import type { RetailerId } from "../types";

export type ProductDataProviderId = "ebay" | "shopsavvy";

export interface ProductIdentifiers {
  upc?: string;
  asin?: string;
  model?: string;
  sku?: string;
  ebayItemId?: string;
}

export interface RetailerOffer {
  retailer: string;
  retailerId?: RetailerId;
  price: number;
  currency: string;
  availability: string;
  productUrl: string;
  imageUrl?: string;
  title?: string;
  condition?: string;
  shippingCost?: number;
  shippingCurrency?: string;
  returnPolicy?: string;
  seller?: {
    username?: string;
    feedbackPercentage?: string;
    feedbackScore?: number;
  };
  lastCheckedAt: string;
  source: ProductDataProviderId;
}

export interface ProductSearchResult {
  canonicalProductId: string;
  providerProductId: string;
  source: ProductDataProviderId;
  title: string;
  brand?: string;
  imageUrl?: string;
  category?: string;
  identifiers: ProductIdentifiers;
  offers: RetailerOffer[];
}

export interface ProductDetails extends ProductSearchResult {
  description?: string;
}

export interface ProductDataProvider {
  readonly id: ProductDataProviderId;
  isConfigured(): boolean;
  searchProducts(query: string): Promise<ProductSearchResult[]>;
  getProductDetails(productId: string): Promise<ProductDetails>;
  getOffers(productId: string): Promise<RetailerOffer[]>;
}

export interface ProductProviderSearchOptions {
  limit?: number;
}
