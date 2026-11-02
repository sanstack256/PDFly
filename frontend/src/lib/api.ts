export function getApiUrl(endpoint: string): string {
  const cleanPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  // If already an absolute URL, return directly
  if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
    return cleanPath;
  }

  // Environment variable override
  if (process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL}${cleanPath}`;
  }

  // Use direct backend port in browser localhost if Next proxy rewrite has any issues
  // But by default, use /api/backend rewrite proxy
  return `/api/backend${cleanPath.replace(/^\/api/, "")}`;
}

export function getDownloadUrl(downloadUrl: string): string {
  if (downloadUrl.startsWith("http://") || downloadUrl.startsWith("https://")) {
    return downloadUrl;
  }
  return getApiUrl(downloadUrl);
}
