export function onRequest() {
  return new Response(JSON.stringify({ error: "Không tìm thấy." }), {
    status: 404,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
