process.on('message', message => { if (message === 'shutdown') process.emit('SIGTERM'); });
await import('../../server/index.js');
