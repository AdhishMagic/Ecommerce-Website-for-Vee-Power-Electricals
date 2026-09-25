import { InventoryItem, StockTransaction } from '../types/inventory';
import { inventoryApi } from '../api/inventory';
import { InventoryItem as ApiInventoryItem, StockLedgerTransaction as ApiStockTransaction } from '../types/api';

const mapApiToInventoryItem = (item: ApiInventoryItem): InventoryItem => {
  return {
    id: String(item.id),
    sku: item.sku,
    productName: item.name,
    brand: typeof item.brand === 'object' && item.brand ? (item.brand as any).name : item.brand_name || String(item.brand || ''),
    category: typeof item.category === 'object' && item.category ? (item.category as any).name : item.category_name || String(item.category || ''),
    currentStock: item.stock,
    lowStockThreshold: item.low_stock_threshold,
    lastUpdated: new Date().toISOString(),
  };
};

const mapApiToStockTransaction = (t: ApiStockTransaction): StockTransaction => {
  return {
    id: String(t.id),
    productId: String(t.product),
    productName: t.product_name,
    changeAmount: t.change_amount,
    type: t.transaction_type as any,
    notes: t.notes || '',
    createdAt: t.created_at,
  };
};

export const inventoryService = {
  async getInventory(params?: { low_stock?: boolean; search?: string }): Promise<InventoryItem[]> {
    const res = await inventoryApi.getInventory(params);
    const results = Array.isArray(res) ? res : res.results || [];
    return results.map(mapApiToInventoryItem);
  },

  async updateStock(
    productId: string | number,
    quantity: number,
    type: 'RESTOCK' | 'ADJUSTMENT',
    notes: string = ''
  ): Promise<StockTransaction | null> {
    if (type === 'RESTOCK') {
      const res = await inventoryApi.restock(productId, Math.abs(quantity), notes);
      return {
        id: `tx_${Date.now()}`,
        productId: String(productId),
        productName: '',
        changeAmount: Math.abs(quantity),
        type: 'RESTOCK',
        notes,
        createdAt: new Date().toISOString(),
      };
    } else {
      const res = await inventoryApi.adjustStock(productId, quantity, notes);
      return {
        id: `tx_${Date.now()}`,
        productId: String(productId),
        productName: '',
        changeAmount: quantity,
        type: 'ADJUSTMENT',
        notes,
        createdAt: new Date().toISOString(),
      };
    }
  },

  async getTransactions(params?: { product?: string | number; type?: string }): Promise<StockTransaction[]> {
    const res = await inventoryApi.getTransactions(params);
    const results = Array.isArray(res) ? res : res.results || [];
    return results.map(mapApiToStockTransaction);
  },
};
