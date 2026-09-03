// View contract for all BizHub views. Every view component default-exports
// a component accepting these props. Navigation is client-side via navigate().
export interface ViewProps {
  params?: Record<string, string>;
  navigate: (view: string, params?: Record<string, string>) => void;
}

export interface NavContextValue {
  view: string;
  params: Record<string, string>;
  navigate: (view: string, params?: Record<string, string>) => void;
  back: () => void;
}
