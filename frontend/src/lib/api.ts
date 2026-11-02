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

  // When running in the browser, connect directly to FastAPI backend on port 8000.
  // This completely bypasses the Next.js rewrite proxy's 10MB body limit, socket
  // hangup, and streaming bottlenecks for large PDFs and processing jobs.
  if (typeof window !== "undefined") {
    const host = window.location.hostname || "localhost";
    const apiPath = cleanPath.startsWith("/api") ? cleanPath : `/api${cleanPath}`;
    return `http://${host}:8000${apiPath}`;
  }

  const apiPath = cleanPath.startsWith("/api") ? cleanPath : `/api${cleanPath}`;
  return `http://127.0.0.1:8000${apiPath}`;
}

export function getDownloadUrl(downloadUrl: string): string {
  if (downloadUrl.startsWith("http://") || downloadUrl.startsWith("https://")) {
    return downloadUrl;
  }
  return getApiUrl(downloadUrl);
}


