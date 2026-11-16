/**
 * Switch for the mock discovery provider (synthetic TEST DATA used to check the candidate
 * pipeline end to end). It is off unless VITE_ENABLE_MOCK_DISCOVERY=true, because the real
 * engine (src/discovery/engine) is now registered.
 */
export const ENABLE_MOCK_DISCOVERY: boolean = import.meta.env.VITE_ENABLE_MOCK_DISCOVERY === "true";

/**
 * Where the engine's data file is read from. The default is the copy shipped with the app
 * (public/engine/discovery.json). Point VITE_ENGINE_DATA_URL at a hosted copy to pick up
 * engine updates without rebuilding the app.
 */
export const ENGINE_DATA_URL: string = import.meta.env.VITE_ENGINE_DATA_URL || `${import.meta.env.BASE_URL}engine/discovery.json`;
