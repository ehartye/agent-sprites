// Request encoding only. Supported commands come from /api/workbench/commands.
export function commandRequest(command, values) {
  if (!command.path) throw new Error('This tool does not make an API request');
  if (command.method === 'GET') {
    const query = new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value != null));
    return { method: 'GET', path: `${command.path}${query.size ? `?${query}` : ''}` };
  }
  return { method: 'POST', path: command.path, body: values };
}
