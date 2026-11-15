/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_CESIUM_ION_TOKEN?: string;
  readonly VITE_ENABLE_MOCK_DISCOVERY?: string;
  readonly VITE_ENGINE_DATA_URL?: string;
  readonly VITE_ASSISTANT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
