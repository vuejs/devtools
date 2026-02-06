// fork from https://github.com/yyx990803/launch-editor/blob/master/packages/launch-editor/guess.js

import path from 'node:path'
import process from 'node:process'
import child_process from 'node:child_process'

// Map from full process name to binary that starts the process
// We can't just re-use full process name, because it will spawn a new instance
// of the app every time
const COMMON_EDITORS_OSX = {
  '/Applications/Atom.app/Contents/MacOS/Atom': 'atom',
  '/Applications/Atom Beta.app/Contents/MacOS/Atom Beta':
    '/Applications/Atom Beta.app/Contents/MacOS/Atom Beta',
  '/Applications/Brackets.app/Contents/MacOS/Brackets': 'brackets',
  '/Applications/Sublime Text.app/Contents/MacOS/Sublime Text':
    '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl',
  '/Applications/Sublime Text.app/Contents/MacOS/sublime_text':
    '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl',
  '/Applications/Sublime Text 2.app/Contents/MacOS/Sublime Text 2':
    '/Applications/Sublime Text 2.app/Contents/SharedSupport/bin/subl',
  '/Applications/Sublime Text Dev.app/Contents/MacOS/Sublime Text':
    '/Applications/Sublime Text Dev.app/Contents/SharedSupport/bin/subl',
  '/Applications/Visual Studio Code.app/Contents/MacOS/Electron': 'code',
  '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron':
    'code-insiders',
  '/Applications/VSCodium.app/Contents/MacOS/Electron': 'codium',
  '/Applications/Cursor.app/Contents/MacOS/Cursor': 'cursor',
  '/Applications/AppCode.app/Contents/MacOS/appcode':
    '/Applications/AppCode.app/Contents/MacOS/appcode',
  '/Applications/CLion.app/Contents/MacOS/clion':
    '/Applications/CLion.app/Contents/MacOS/clion',
  '/Applications/IntelliJ IDEA.app/Contents/MacOS/idea':
    '/Applications/IntelliJ IDEA.app/Contents/MacOS/idea',
  '/Applications/IntelliJ IDEA Ultimate.app/Contents/MacOS/idea':
    '/Applications/IntelliJ IDEA Ultimate.app/Contents/MacOS/idea',
  '/Applications/IntelliJ IDEA Community Edition.app/Contents/MacOS/idea':
    '/Applications/IntelliJ IDEA Community Edition.app/Contents/MacOS/idea',
  '/Applications/PhpStorm.app/Contents/MacOS/phpstorm':
    '/Applications/PhpStorm.app/Contents/MacOS/phpstorm',
  '/Applications/PyCharm.app/Contents/MacOS/pycharm':
    '/Applications/PyCharm.app/Contents/MacOS/pycharm',
  '/Applications/PyCharm CE.app/Contents/MacOS/pycharm':
    '/Applications/PyCharm CE.app/Contents/MacOS/pycharm',
  '/Applications/RubyMine.app/Contents/MacOS/rubymine':
    '/Applications/RubyMine.app/Contents/MacOS/rubymine',
  '/Applications/WebStorm.app/Contents/MacOS/webstorm':
    '/Applications/WebStorm.app/Contents/MacOS/webstorm',
  '/Applications/MacVim.app/Contents/MacOS/MacVim': 'mvim',
  '/Applications/GoLand.app/Contents/MacOS/goland':
    '/Applications/GoLand.app/Contents/MacOS/goland',
  '/Applications/Rider.app/Contents/MacOS/rider':
    '/Applications/Rider.app/Contents/MacOS/rider',
  '/Applications/Zed.app/Contents/MacOS/zed': 'zed',
}

const COMMON_EDITORS_LINUX = {
  'atom': 'atom',
  'Brackets': 'brackets',
  'code-insiders': 'code-insiders',
  'code': 'code',
  'vscodium': 'vscodium',
  'codium': 'codium',
  'emacs': 'emacs',
  'gvim': 'gvim',
  'idea.sh': 'idea',
  'phpstorm.sh': 'phpstorm',
  'pycharm.sh': 'pycharm',
  'rubymine.sh': 'rubymine',
  'sublime_text': 'subl',
  'vim': 'vim',
  'webstorm.sh': 'webstorm',
  'goland.sh': 'goland',
  'rider.sh': 'rider',
}

const COMMON_EDITORS_WIN = [
  'Brackets.exe',
  'Code.exe',
  'Code - Insiders.exe',
  'VSCodium.exe',
  'atom.exe',
  'sublime_text.exe',
  'notepad++.exe',
  'clion.exe',
  'clion64.exe',
  'idea.exe',
  'idea64.exe',
  'phpstorm.exe',
  'phpstorm64.exe',
  'pycharm.exe',
  'pycharm64.exe',
  'rubymine.exe',
  'rubymine64.exe',
  'webstorm.exe',
  'webstorm64.exe',
  'goland.exe',
  'goland64.exe',
  'rider.exe',
  'rider64.exe',
]

export function guessEditor(): [string | null, string?] {
  // We can find out which editor is currently running by:
  // `ps x` on macOS and Linux
  // `Get-Process` on Windows
  try {
    if (process.platform === 'darwin') {
      const output = child_process.execSync('ps x').toString()
      const processNames = Object.keys(COMMON_EDITORS_OSX)
      const processName = processNames.find(processName => output.includes(processName))
      return [processName ? COMMON_EDITORS_OSX[processName] : null]
    }
    else if (process.platform === 'win32') {
      // Some processes need elevated rights to get its executable path.
      // Just filter them out upfront. This also saves 10-20ms on the command.
      const output = child_process
        .execSync(
          'wmic process where "executablepath is not null" get executablepath',
        )
        .toString()
      const runningProcesses = output.split('\r\n')

      const processName = runningProcesses
        .find(processName => COMMON_EDITORS_WIN
          .includes(path.basename(processName.trim())))
      return [processName ? processName.trim() : null]
    }
    else if (process.platform === 'linux') {
      // --no-heading No header line
      // x List all processes owned by you
      // -o comm Need only names column
      const output = child_process
        .execSync('ps x --no-heading -o comm --sort=comm')
        .toString()
      const processNames = Object.keys(COMMON_EDITORS_LINUX)
      const processName = processNames.find(processName => output.includes(processName))
      return [processName ? COMMON_EDITORS_LINUX[processName] : null]
    }
  }
  catch (error) {
    // Ignore...
    return [null]
  }

  // Last resort, use old skool env vars
  if (process.env.VISUAL)
    return [process.env.VISUAL]
  else if (process.env.EDITOR)
    return [process.env.EDITOR]

  return [null]
}
