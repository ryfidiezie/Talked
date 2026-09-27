# Talked

A keyboard-driven launcher for Windows. Hit a shortcut, type what you need, and get out. Search apps, run commands, control your system, browse files, manage your clipboard, and talk to an AI assistant - all without leaving your keyboard.

Built with Electron, React, and Gemini Live.

---

## Installation

```bash
npm install
npm start
```

The app builds the Vite bundle and launches Electron. On first run, open Settings (`/settings`) and paste your Gemini API key.

For development without rebuilding:

```bash
npm run electron
```

---

## Hotkey

`Alt+Space` toggles the launcher on and off. `Ctrl+Space` and `Ctrl+Shift+Space` are registered as fallbacks if `Alt+Space` is taken. The window hides automatically when it loses focus.

`Alt+C` opens the launcher and triggers a screen capture for the AI assistant.

---

## Modes

| Mode | Description |
|---|---|
| **Search** | Default. Type to search apps, run commands, browse files, or do math. |
| **Grid** | Action grid with quick-access buttons for system controls. |

Toggle between modes using the mode button in the launcher bar, or set a default in Settings.

---

## Search

Typing anything without a `/` prefix searches your installed applications and offers web search fallbacks via Google and DuckDuckGo.

**Math and unit conversion** is evaluated inline as you type. Results copy to clipboard on Enter.

**File browsing** activates when your query looks like a path (`C:\`, `~\`, `./`, etc.). Navigate directories and open files directly.

---

## Commands

Prefix any command with `/`. Typing `/` alone lists everything available.

### System

| Command | Description |
|---|---|
| `/lock` | Lock the workstation |
| `/sleep` | Put the PC to sleep |
| `/shutdown` | Shutdown in 60 seconds |
| `/shutdown now` | Immediate shutdown |
| `/shutdown cancel` | Abort a scheduled shutdown or restart |
| `/restart` | Restart in 60 seconds |
| `/trash` | Empty the Recycle Bin |
| `/vol up` | Increase system volume |
| `/vol down` | Decrease system volume |
| `/vol mute` | Toggle mute |

### Window Management

| Command | Description |
|---|---|
| `/snap left` | Snap the active window to the left half |
| `/snap right` | Snap the active window to the right half |
| `/maximize` | Maximize the active window |
| `/minimize` | Minimize the active window |
| `/show-desktop` | Minimize all windows |

### Tools

| Command | Description |
|---|---|
| `/open <app>` | Launch an application |
| `/type <text>` | Type text into the previously active app |
| `/url <address>` | Open a URL in the default browser |
| `/run <command>` | Execute a shell command (requires confirmation) |
| `/kill <process>` | Terminate a process by name |
| `/clip` | Read current clipboard contents |
| `/clips` | Browse and search clipboard history |
| `/clips clear` | Delete all clipboard history |
| `/screenshot` | Capture the screen to clipboard |
| `/color` | Sample a pixel color and copy the HEX value |
| `/downloads` | Open the Downloads folder |
| `/documents` | Open the Documents folder |
| `/desktop` | Open the Desktop folder |
| `/pictures` | Open the Pictures folder |

### Info

| Command | Description |
|---|---|
| `/time` | Show current local time |
| `/date` | Show current date |
| `/ip` | Show local IP addresses |
| `/sys` | Show CPU, RAM, and OS info |
| `/encode <text>` | Base64 encode |
| `/decode <text>` | Base64 decode |

### Utility

| Command | Description |
|---|---|
| `/reminder <duration> <message>` | Set a timed reminder (e.g. `/reminder 5m stretch`) |
| `/settings` | Open the settings panel |
| `/clear` | Clear the current output |
| `/help` | List all commands |

Reminder durations accept seconds (`s`), minutes (`m`), and hours (`h`).

---

## Clipboard History

Talked monitors the clipboard in the background and keeps the last 50 entries. Access them with `/clips` and press Enter on any item to paste it into the previously active window. History persists across restarts.

---

## AI Voice Assistant

The launcher includes a voice assistant powered by the Gemini Live API. The assistant has access to desktop tools including:

- Opening applications and URLs
- Reading and writing the clipboard
- Running shell commands (with confirmation)
- Taking screenshots and describing them
- Controlling system volume, lock, and sleep
- Managing windows (snap, maximize, minimize)
- Getting system info and network details
- Drawing overlays on screen (highlight boxes, arrows, circles)
- Setting reminders

A Gemini API key is required. Add it in `/settings`.

---

## Settings

| Setting | Description |
|---|---|
| **API Key** | Gemini API key for the AI assistant |
| **Position** | Launcher position on screen (upper-center, center, top, bottom, top-right) |
| **Default Mode** | Whether to open in Search or Grid mode by default |

Settings are saved to `localStorage`.

---

## Project Structure

```
Talked/
├── main.js                  Electron main process, IPC handlers, system tools
├── preload.js               Exposes talkedDesktop bridge to renderer
├── overlay.html             Transparent overlay window for screen drawings
├── overlay-preload.js       Bridge for the overlay window
├── index.html               Renderer entry point
├── vite.config.mjs          Vite config
└── src/
    ├── App.jsx              Root component, state, and result orchestration
    ├── main.jsx             React entry point
    ├── index.css            Global styles
    ├── commands/
    │   └── builtins.js      Slash command definitions and executor
    ├── components/
    │   ├── LauncherBar.jsx  Search input and mode toggle
    │   ├── ResultsPanel.jsx Keyboard-navigable results list
    │   ├── ActionGrid.jsx   Grid mode quick-action buttons
    │   ├── SpotlightBar.jsx AI voice assistant UI
    │   ├── DialogueFeed.jsx AI conversation transcript
    │   ├── SettingsModal.jsx Settings panel
    │   ├── CommandConfirmModal.jsx Shell command approval dialog
    │   └── ToolsMenu.jsx    AI tools context menu
    ├── services/
    │   ├── geminiLiveClient.js  Gemini Live WebSocket client
    │   └── geminiTextClient.js  Gemini text API client
    └── utils/
        └── converters.js    Unit conversion parser
```

---

## Scripts

| Script | Description |
|---|---|
| `npm start` | Build and launch |
| `npm run electron` | Launch without building (uses existing dist) |
| `npm run build` | Build Vite bundle only |
| `npm run dev` | Start Vite dev server |
| `npm run site` | Serve the website directory |

---

## License

MIT
