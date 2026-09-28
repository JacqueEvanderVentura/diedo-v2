import fs from 'node:fs'
import path from 'node:path'

export function resolvePython(root) {
  if (process.env.ERP_PYTHON) return process.env.ERP_PYTHON
  const candidate = process.platform === 'win32'
    ? path.join(root, '.venv', 'Scripts', 'python.exe')
    : path.join(root, '.venv', 'bin', 'python')
  return fs.existsSync(candidate) ? candidate : 'python'
}
