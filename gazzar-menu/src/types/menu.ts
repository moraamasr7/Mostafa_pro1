import { OrderType } from './orders'

export interface MenuVariantRow {
  category_id: string;
  category_name: string;
  category_order: number;
  item_id: string;
  item_name: string;
  item_description: string | null;
  item_available: boolean;
  variant_id: string;
  variant_name: string;
  price: number;
  variant_available: boolean;
}

export interface CartLine {
  variant_id: string;
  item_name: string;
  variant_name: string;
  price: number;
  quantity: number;
  item_notes?: string;
}

export interface OrderItemInput {
  variant_id: string;
  quantity: number;
  item_notes?: string;
}

export type PaymentMethod = 'cash' | 'instapay' | 'wallet'

export interface CreateOrderPayload {
  customer_name: string;
  customer_phone: string;
  notes?: string;
  order_type?: OrderType;
  delivery_address?: string;
  payment_method?: PaymentMethod;
  payment_receipt_url?: string;
  items: OrderItemInput[];
  turnstile_token?: string;
}

export interface GroupedMenuItem {
  id: string;
  name: string;
  description: string | null;
  available: boolean;
  variants: {
    id: string;
    name: string;
    price: number;
    available: boolean;
  }[];
}

export interface GroupedCategory {
  id: string;
  name: string;
  order: number;
  items: GroupedMenuItem[];
}
