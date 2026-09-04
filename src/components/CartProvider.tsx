"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CartLine = {
  lineId: string;
  itemId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  optionsLabel: string;
  choiceIds: string[];
  notes: string;
};

export type Cart = {
  orgId: string | null;
  slug: string | null;
  brandName: string | null;
  lines: CartLine[];
};

const EMPTY: Cart = { orgId: null, slug: null, brandName: null, lines: [] };
const STORAGE_KEY = "md.cart.v1";

type CartApi = {
  cart: Cart;
  itemCount: number;
  subtotalCents: number;
  addLine: (
    org: { orgId: string; slug: string; brandName: string },
    line: Omit<CartLine, "lineId">,
  ) => void;
  setQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  hydrated: boolean;
};

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // Read once on mount so server and client markup match on first paint.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCart(JSON.parse(raw) as Cart);
    } catch {
      // Private mode or cleared storage — an empty cart is the right fallback.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Non-fatal: the cart still works for this session.
    }
  }, [cart, hydrated]);

  const addLine: CartApi["addLine"] = useCallback((org, line) => {
    setCart((prev) => {
      // One restaurant per cart. Switching restaurants starts a new cart.
      const base =
        prev.orgId && prev.orgId !== org.orgId
          ? { ...EMPTY, ...org }
          : { ...prev, ...org };

      const signature = `${line.itemId}::${[...line.choiceIds].sort().join(",")}::${line.notes}`;
      const existing = base.lines.find(
        (l) => `${l.itemId}::${[...l.choiceIds].sort().join(",")}::${l.notes}` === signature,
      );

      if (existing) {
        return {
          ...base,
          lines: base.lines.map((l) =>
            l.lineId === existing.lineId ? { ...l, qty: Math.min(20, l.qty + line.qty) } : l,
          ),
        };
      }
      return {
        ...base,
        lines: [
          ...base.lines,
          { ...line, lineId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
        ],
      };
    });
  }, []);

  const setQty = useCallback((lineId: string, qty: number) => {
    setCart((prev) => {
      const lines = prev.lines
        .map((l) => (l.lineId === lineId ? { ...l, qty: Math.max(0, Math.min(20, qty)) } : l))
        .filter((l) => l.qty > 0);
      return lines.length === 0 ? EMPTY : { ...prev, lines };
    });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setCart((prev) => {
      const lines = prev.lines.filter((l) => l.lineId !== lineId);
      return lines.length === 0 ? EMPTY : { ...prev, lines };
    });
  }, []);

  const clear = useCallback(() => setCart(EMPTY), []);

  const value = useMemo<CartApi>(() => {
    const itemCount = cart.lines.reduce((n, l) => n + l.qty, 0);
    const subtotalCents = cart.lines.reduce((n, l) => n + l.unitPriceCents * l.qty, 0);
    return { cart, itemCount, subtotalCents, addLine, setQty, removeLine, clear, hydrated };
  }, [cart, addLine, setQty, removeLine, clear, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
