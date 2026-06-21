import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { MODELS, applyApiPricing, type CatalogModel } from "./catalog";
import { api } from "./api";

type CatalogCtx = {
  models: CatalogModel[];
  markup: number;
  loading: boolean;
  reload: () => Promise<void>;
};

const CatalogContext = createContext<CatalogCtx>({
  models: MODELS,
  markup: 2,
  loading: true,
  reload: async () => {},
});

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<CatalogModel[]>(MODELS);
  const [markup, setMarkup] = useState(2);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await api.catalog();
      setMarkup(data.markup);
      setModels(applyApiPricing(MODELS, data.models));
    } catch {
      /* остаёмся на дефолтных ценах из catalog.ts */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <CatalogContext.Provider value={{ models, markup, loading, reload }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  return useContext(CatalogContext);
}

/** Обновить цены после смены наценки в админке. */
export function applyCatalogPatch(apiModels: { id: string; pricing: CatalogModel["pricing"] }[], markup: number) {
  return { models: applyApiPricing(MODELS, apiModels), markup };
}
