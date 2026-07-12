import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://typesensekit.vercel.app",
  output: "static",
  integrations: [
    sitemap({
      changefreq: "weekly",
      serialize(item) {
        const pathname = new URL(item.url).pathname;
        if (pathname === "/") item.priority = 1;
        else if (["/typesense-cli/", "/typesense-mcp/"].includes(pathname))
          item.priority = 0.9;
        else item.priority = 0.7;
        return item;
      },
    }),
  ],
});
