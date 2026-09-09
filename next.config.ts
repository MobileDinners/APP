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
  /**
   * No `output: "standalone"`.
   *
   * It was set to emit a self-contained server bundle, but the service starts
   * with `npm start` — that is, `next start` — and Next warns on every boot
   * that the two do not go together:
   *
   *   ⚠ "next start" does not work with "output: standalone" configuration.
   *
   * So the standalone bundle was built, uploaded and then never executed, on
   * every single deploy. Switching the start command to run the bundle would
   * also work, but it means hand-copying `public/` and the static chunks into
   * `.next/standalone` in the build step, and getting that subtly wrong ships
   * a site with no CSS. `next start` on Render is not the bottleneck; the
   * wasted build is. Dropping the flag is the cheaper correct answer.
   */
  // The floating dev badge sits on top of the bottom tab bar; hide it so the
  // consumer app can be demoed and screenshotted as it will actually ship.
  devIndicators: false,
};

export default nextConfig;
