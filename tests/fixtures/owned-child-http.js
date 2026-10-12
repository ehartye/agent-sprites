import http from 'node:http';

// A shutdown response deliberately leaves the process alive until the parent releases IPC.
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
});
server.on('error', error => {
  console.error(`Web server failed: ${error.message}`);
  process.send({ type: 'listen-failed' }); // Hold the failed child alive to expose the port-selection race deterministically.
});
server.listen(Number(process.env.SPRITE_PORT || 0), '127.0.0.1', () => {
  console.error(`Sprite editor: http://localhost:${server.address().port}`);
  process.send({ type: 'ready', port: server.address().port });
});
process.on('message', message => {
  if (message === 'probe') process.send({ type: 'exit-barrier-held' });
  if (message === 'release') {
    if (server.listening) server.close(() => process.disconnect());
    else { process.exitCode = 1; process.disconnect(); }
  }
});
