import { InventoryItem, StockTransaction } from '../types/inventory';
import { apiFetch } from './api';

export const inventoryService = {
  async getInventory(): Promise<InventoryItem[]> {
    try {
      return await apiFetch<InventoryItem[]>('/inventory/');
    } catch {
      return [];
    }
  },

  async updateStock(productId: string, quantity: number, type: 'RESTOCK' | 'ADJUSTMENT', notes: string): Promise<StockTransaction | null> {
    try {
      return await apiFetch<StockTransaction>(`/inventory/${productId}/transaction/`, {
        method: 'POST',
        body: JSON.stringify({ quantity, type, notes }),
      });
    } catch {
      return null;
    }
  }
};
