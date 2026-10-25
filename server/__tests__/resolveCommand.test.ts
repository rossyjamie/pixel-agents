import { describe, expect, it } from 'vitest';

import { resolveSpawnCommand } from '../src/terminal/resolveCommand.js';

/** Fake filesystem: only the listed paths exist (compared case-insensitively,
 *  as on NTFS). Tests never touch the real disk, so they run on any OS. */
function files(...paths: string[]): (candidate: string) => boolean {
  const set = new Set(paths.map((p) => p.toLowerCase()));
  return (candidate) => set.has(candidate.toLowerCase());
}

const win = (isFile: (candidate: string) => boolean) => ({ platform: 'win32' as const, isFile });

describe('resolveSpawnCommand', () => {
  it('leaves the command alone off Windows', () => {
    const env = { PATH: '/usr/bin' };
    expect(resolveSpawnCommand('claude', env, { platform: 'darwin', isFile: () => true })).toBe(
      'claude',
    );
    expect(resolveSpawnCommand('claude', env, { platform: 'linux', isFile: () => true })).toBe(
      'claude',
    );
  });

  it('applies PATHEXT so a bare name finds the .exe', () => {
    const env = { PATH: 'C:\\Tools', PATHEXT: '.COM;.EXE;.CMD' };
    expect(resolveSpawnCommand('claude', env, win(files('C:\\Tools\\claude.exe')))).toBe(
      'C:\\Tools\\claude.EXE',
    );
  });

  it('searches the LAST Path entry too', () => {
    // node-pty's own lookup skips this entry, which is where Claude Code's
    // native installer appends its folder.
    const env = {
      Path: 'C:\\Windows\\system32;C:\\Program Files\\nodejs;C:\\Users\\me\\.local\\bin',
      PATHEXT: '.EXE',
    };
    expect(
      resolveSpawnCommand('claude', env, win(files('C:\\Users\\me\\.local\\bin\\claude.exe'))),
    ).toBe('C:\\Users\\me\\.local\\bin\\claude.EXE');
  });

  it('respects Path order and PATHEXT order', () => {
    const env = { PATH: 'C:\\A;C:\\B', PATHEXT: '.CMD;.EXE' };
    const isFile = files('C:\\A\\claude.exe', 'C:\\A\\claude.cmd', 'C:\\B\\claude.cmd');
    expect(resolveSpawnCommand('claude', env, win(isFile))).toBe('C:\\A\\claude.CMD');
  });

  it('reads env names case-insensitively and ignores empty or quoted entries', () => {
    const env = { pAtH: ';"C:\\Quoted Dir";;', pathext: '.EXE' };
    expect(resolveSpawnCommand('claude', env, win(files('C:\\Quoted Dir\\claude.exe')))).toBe(
      'C:\\Quoted Dir\\claude.EXE',
    );
  });

  it('falls back to %USERPROFILE%\\.local\\bin when Path has no match', () => {
    const env = { PATH: 'C:\\Windows', PATHEXT: '.EXE', USERPROFILE: 'C:\\Users\\me' };
    expect(
      resolveSpawnCommand('claude', env, win(files('C:\\Users\\me\\.local\\bin\\claude.exe'))),
    ).toBe('C:\\Users\\me\\.local\\bin\\claude.EXE');
  });

  it('uses the default PATHEXT when the environment has none', () => {
    const env = { PATH: 'C:\\Tools' };
    expect(resolveSpawnCommand('claude', env, win(files('C:\\Tools\\claude.exe')))).toBe(
      'C:\\Tools\\claude.EXE',
    );
  });

  it('accepts a name that already has an extension', () => {
    const env = { PATH: 'C:\\Tools', PATHEXT: '.EXE' };
    expect(resolveSpawnCommand('claude.exe', env, win(files('C:\\Tools\\claude.exe')))).toBe(
      'C:\\Tools\\claude.exe',
    );
  });

  it('leaves commands with a directory part untouched', () => {
    const env = { PATH: 'C:\\Tools', PATHEXT: '.EXE' };
    const isFile = files('C:\\Tools\\claude.exe');
    expect(resolveSpawnCommand('C:\\Other\\claude.exe', env, win(isFile))).toBe(
      'C:\\Other\\claude.exe',
    );
    expect(resolveSpawnCommand('.\\claude', env, win(isFile))).toBe('.\\claude');
  });

  it('returns the command unchanged when nothing matches', () => {
    const env = { PATH: 'C:\\Tools', PATHEXT: '.EXE', USERPROFILE: 'C:\\Users\\me' };
    expect(resolveSpawnCommand('claude', env, win(files()))).toBe('claude');
  });
});
