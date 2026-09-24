Deno.serve(() => new Response(
  `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Fenwick Recorder — Payment received</title>
      <style>
        body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f8ff;color:#17233f;font-family:system-ui,sans-serif}
        main{width:min(440px,calc(100% - 32px));padding:32px;border:1px solid #d9e2f2;border-radius:24px;background:#fff;box-shadow:0 20px 60px #4560901a;text-align:center}
        h1{margin:0 0 12px;font-size:28px}p{margin:0;color:#687895;line-height:1.6}
      </style>
    </head>
    <body>
      <main>
        <h1>Payment received</h1>
        <p>Return to Fenwick Recorder, open Profile, and select “Refresh plan.” Webhook verification may take a few seconds.</p>
      </main>
    </body>
  </html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8" } },
));
