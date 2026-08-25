import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import createNextIntlPlugin from "next-intl/plugin";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
});
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(withSerwist(nextConfig));
