// IPC lets the parent deliver Node's signal event portably on Windows as well.
process.on('message', message => {
  if (message === 'interrupt') {
    process.emit('SIGINT');
    process.send('interrupted', () => process.disconnect());
  }
});
const file = process.argv[2];
process.argv = [process.execPath, new URL('../../scripts/sprite.js', import.meta.url).pathname, 'import', file];
await import('../../scripts/sprite.js');
