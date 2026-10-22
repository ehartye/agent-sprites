import { join } from 'node:path';
import { restoreProjectMetadata } from './project-state.js';
import { publishProject } from './project-publication.js';

export function projectName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[<>:"/\\|?*\x00-\x1f]/.test(value) || /[. ]$/.test(value) || ['.', '..'].includes(value)) {
    throw new Error('Use a project name of 1–120 characters without path separators or reserved filename characters');
  }
  return value.trim();
}

export function activateProjectCopy(state, project, { origin } = {}) {
  const parent = state.sessionId ? state.db.getSession(state.sessionId) : null;
  const projectPath = parent?.project_path ?? process.cwd();
  const json = JSON.stringify(project.toStorageJSON());
  const session = state.db.db.transaction(() => {
    const pending = state.db.createSession({ project_name: project.name, project_path: projectPath,
      destination_folder: '', json_file: null, draft_json: json });
    state.db.updateSession(pending.id, { destination_folder: join(projectPath, 'assets', 'agent-sprites', pending.id, project.name) });
    restoreProjectMetadata({ ...state, project, sessionId: pending.id });
    return pending;
  })();
  state.project = project; state.sessionId = session.id;
  // Publication follows the committed transaction and cannot roll it back.
  try { publishProject(state); }
  catch (error) { console.error('Project activated; notification failed:', String(error.message).slice(0, 300)); }
  return { session_id: session.id, project_name: project.name, copied_from: origin ?? null };
}
