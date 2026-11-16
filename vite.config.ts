/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { fileURLToPath, URL } from "node:url";
import { MAX_BODY_BYTES, parseBody, requestParams } from "./supabase/functions/_shared/assistantSpec";

// CesiumJS loads its web workers, widgets CSS and assets at runtime from CESIUM_BASE_URL.
const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumBaseUrl = "cesium";

// Where the app is served from. "/" by default; a GitHub Pages project site needs "/<repository>/"
// (set by .github/workflows/deploy-pages.yml through VITE_BASE).
const base = process.env.VITE_BASE || "/";

/**
 * The assistant during development: `/api/assistant` on the dev server calls Claude with the
 * key in `.env` (ANTHROPIC_API_KEY, no VITE_ prefix, so it never reaches the browser). Without
 * a key it answers 503 and the app uses its built-in answers. The published app uses the
 * Supabase function instead (supabase/functions/assistant).
 */
function assistantDevServer(): Plugin {
  return {
    name: "hypatia-assistant-dev",
    apply: "serve",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      server.middlewares.use("/api/assistant", (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return send(405, { error: "Use POST." });
        const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return send(503, { error: "not_configured" });
        let raw = "";
        req.on("data", (chunk: Buffer) => {
          raw += chunk;
          if (raw.length > MAX_BODY_BYTES) req.destroy();
        });
        req.on("end", () => {
          void (async () => {
            let body: unknown;
            try {
              body = JSON.parse(raw);
            } catch {
              return send(400, { error: "The request body must be JSON." });
            }
            const parsed = parseBody(body);
            if ("error" in parsed) return send(parsed.status, { error: parsed.error });
            const { default: Anthropic } = await import("@anthropic-ai/sdk");
            const client = new Anthropic({ apiKey });
            try {
              const params = requestParams(parsed.messages) as unknown as Parameters<typeof client.beta.messages.create>[0];
              const response = await client.beta.messages.create({ ...params, stream: false });
              send(200, { content: response.content, stop_reason: response.stop_reason, model: response.model });
            } catch (error) {
              if (error instanceof Anthropic.RateLimitError) send(429, { error: "The assistant is busy. Try again in a moment." });
              else if (error instanceof Anthropic.AuthenticationError) send(503, { error: "not_configured" });
              else if (error instanceof Anthropic.APIError) send(502, { error: `The model request failed (${error.status ?? "no status"}).` });
              else send(502, { error: "The assistant could not be reached." });
            }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    assistantDevServer(),
    viteStaticCopy({
      targets: ["ThirdParty", "Workers", "Assets", "Widgets"].map((dir) => ({
        src: `${cesiumSource}/${dir}`,
        dest: cesiumBaseUrl,
      })),
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify(`${base}${cesiumBaseUrl}`),
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 6000 },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
