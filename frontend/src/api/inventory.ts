import { apiClient } from './client';
import { InventoryItem, StockLedgerTransaction, PaginatedResponse } from '../types/api';

export const inventoryApi = {
  async getInventory(params?: {
    low_stock?: boolean;
    search?: string;
    q?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<InventoryItem>> {
    return apiClient<PaginatedResponse<InventoryItem>>('/inventory/', { params });
  },

  async restock(productId: number | string, quantity: number, notes: string = ''): Promise<{ message: string; stock: number }> {
    return apiClient<{ message: string; stock: number }>('/inventory/restock/', {
      method: 'POST',
      body: {
        product_id: Number(productId),
        quantity,
        notes,
      },
    });
  },

  async adjustStock(productId: number | string, changeAmount: number, notes: string = ''): Promise<{ message: string; stock: number }> {
    return apiClient<{ message: string; stock: number }>('/inventory/adjust/', {
      method: 'POST',
      body: {
        product_id: Number(productId),
        change_amount: changeAmount,
        notes,
      },
    });
  },

  async getTransactions(params?: {
    product?: number | string;
    type?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<StockLedgerTransaction>> {
    return apiClient<PaginatedResponse<StockLedgerTransaction>>('/inventory/transactions/', { params });
  },
};
