import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Where the build goes.
   *
   * `next build` and `next dev` share .next by default, so building while a dev
   * server is running overwrites the files that server is holding open. It does
   * not fail loudly: the dev server starts answering with "Cannot find module"
   * or "a[d] is not a function", which looks exactly like a code bug and is
   * not one. That has cost real debugging time on this project more than once.
   *
   * MD_DIST_DIR gives a build its own directory, so a production build can be
   * run and tested while a dev server keeps working:
   *
   *   MD_DIST_DIR=.next-prod npm run build
   *   MD_DIST_DIR=.next-prod PORT=3111 npm start
   *
   * Unset — which is the case on Render — this is exactly the default.
   */
  distDir: process.env.MD_DIST_DIR || ".next",
  // Emits a self-contained server bundle so the container does not need
  // node_modules or the Next CLI at runtime.
  output: "standalone",
  // The floating dev badge sits on top of the bottom tab bar; hide it so the
  // consumer app can be demoed and screenshotted as it will actually ship.
  devIndicators: false,
};

export default nextConfig;
