// HTTP response helpers shared by all handlers.

export function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
  }
}

export function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  })
}

export function svgResp(body: string, status = 200, cacheSeconds = 300): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': `public, max-age=${cacheSeconds}`,
      ...corsHeaders(),
    },
  })
}
