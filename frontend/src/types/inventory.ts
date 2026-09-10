export interface InventoryItem {
  id: string;
  sku: string;
  productName: string;
  brand: string;
  category: string;
  currentStock: number;
  lowStockThreshold: number;
  lastUpdated: string;
}

export interface StockTransaction {
  id: string;
  productId: string;
  productName: string;
  changeAmount: number;
  type: 'RESTOCK' | 'SALE' | 'ADJUSTMENT' | 'RETURN';
  notes: string;
  createdAt: string;
}
