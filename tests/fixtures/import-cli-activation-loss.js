// Exercise the real command while losing only its activation/recovery transport.
const [file, mode, interrupted] = process.argv.slice(2);
const originalFetch = globalThis.fetch;
let activationSent = false;
globalThis.fetch = async (url, options) => {
  if (activationSent && mode === 'unconfirmed') throw new Error('Import recovery unavailable');
  const response = await originalFetch(url, options);
  if (url.endsWith('/activate')) {
    await response.json(); activationSent = true;
    if (interrupted === 'true') process.emit('SIGINT');
    throw new Error('Activation response lost');
  }
  return response;
};
process.argv = [process.execPath, new URL('../../scripts/sprite.js', import.meta.url).pathname, 'import', file];
await import('../../scripts/sprite.js');
