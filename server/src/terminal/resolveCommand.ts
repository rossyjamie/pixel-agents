/**
 * Windows command resolution for PTY spawns.
 *
 * node-pty hands a bare command to its own PATH lookup on Windows, and that
 * lookup misses in two ways: it never applies PATHEXT (so `claude` never
 * matches `claude.exe`), and it skips the LAST entry of Path -- exactly where
 * Claude Code's native installer appends `%USERPROFILE%\.local\bin`. The spawn
 * then fails although `claude` works in any shell. Resolving to an absolute
 * path first sidesteps the lookup entirely.
 *
 * POSIX spawns are left alone: execvp already searches PATH correctly there.
 */

import * as fs from 'fs';
import * as path from 'path';

import { WINDOWS_DEFAULT_PATHEXT, WINDOWS_USER_BIN_SEGMENTS } from '../constants.js';

export interface ResolveCommandOptions {
  platform?: NodeJS.Platform;
  /** Injectable for tests; production checks the real filesystem. */
  isFile?: (candidate: string) => boolean;
}

/**
 * Absolute path for `command` on Windows, or `command` unchanged when it
 * already names a path, when nothing matches, or on any other platform.
 */
export function resolveSpawnCommand(
  command: string,
  env: Record<string, string>,
  options: ResolveCommandOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return command;
  // A command with a directory part is the caller's explicit choice.
  if (path.win32.basename(command) !== command) return command;

  const isFile = options.isFile ?? isRegularFile;
  const extensions = splitList(envValue(env, 'PATHEXT') ?? WINDOWS_DEFAULT_PATHEXT);
  const names = path.win32.extname(command)
    ? [command, ...extensions.map((ext) => command + ext)]
    : extensions.map((ext) => command + ext);

  const dirs = splitList(envValue(env, 'PATH') ?? '');
  const userProfile = envValue(env, 'USERPROFILE');
  if (userProfile) dirs.push(path.win32.join(userProfile, ...WINDOWS_USER_BIN_SEGMENTS));

  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.win32.join(dir, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return command;
}

/** Windows env names are case-insensitive (`Path` vs `PATH`); a plain object isn't. */
function envValue(env: Record<string, string>, name: string): string | undefined {
  const upper = name.toUpperCase();
  const key = Object.keys(env).find((k) => k.toUpperCase() === upper);
  return key === undefined ? undefined : env[key];
}

/** Split a `;`-separated Windows list, dropping empty entries and stray quotes. */
function splitList(value: string): string[] {
  return value
    .split(';')
    .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
    .filter((entry) => entry.length > 0);
}

function isRegularFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}
