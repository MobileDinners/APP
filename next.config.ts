import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the container does not need
  // node_modules or the Next CLI at runtime.
  output: "standalone",
  // The floating dev badge sits on top of the bottom tab bar; hide it so the
  // consumer app can be demoed and screenshotted as it will actually ship.
  devIndicators: false,
};

export default nextConfig;
