/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_CLYPRA_EDITOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
