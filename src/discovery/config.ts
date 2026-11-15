/**
 * Single switch for the mock discovery provider (synthetic TEST DATA used to check the
 * candidate pipeline end to end). Set to false, or set VITE_ENABLE_MOCK_DISCOVERY=false,
 * to remove every mock candidate from the app.
 */
export const ENABLE_MOCK_DISCOVERY: boolean = import.meta.env.VITE_ENABLE_MOCK_DISCOVERY !== "false";
