/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 to natywny moduł Node – nie pakujemy go do bundla
  serverExternalPackages: ['better-sqlite3'],
};
export default nextConfig;
