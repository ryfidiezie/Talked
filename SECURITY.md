# Security Policy
## Supported Versions
Only the latest release and the current `main` branch receive active security updates.
| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| < 1.0   | No        |
## Reporting a Vulnerability
If you discover a security vulnerability in Talked, please report it responsibly rather than opening a public issue.
### Preferred Reporting Method

Use GitHub's private vulnerability reporting feature:
1. Navigate to the repository on GitHub.
2. Click on the **Security** tab.
3. Click **Report a vulnerability** to open a private draft advisory.
If private vulnerability reporting is unavailable, contact the repository maintainers directly through their GitHub profile.
### What to Include in Your Report
To help resolve the issue quickly, include:
- A clear description of the vulnerability.
- Steps to reproduce the issue or a proof-of-concept.
- Affected components (for example: IPC handlers, clipboard watcher, command runner, shell execution).
- The operating system and version of Talked used during testing.
- Any potential mitigations or patch suggestions if available.
## Response Timeline
- **Initial Acknowledgement**: Within 48 hours of receipt.
- **Assessment and Confirmation**: Within 5 business days.
- **Fix and Release**: Critical vulnerabilities are patched as soon as practical, followed by a release and security advisory publication.
## Scope and Security Model
Talked executes commands on behalf of the user and interacts directly with system resources. The following mechanisms are in place:
- **Context Isolation**: The Electron renderer runs with `contextIsolation: true` and `nodeIntegration: false`. All privileged actions pass through validated IPC channels in `preload.js`.
- **Command Execution Confirmation**: Destructive tools and shell execution commands (`/run`, `runCommand`) require explicit user confirmation before execution.
- **API Key Storage**: API keys are stored locally on the client device and are never sent to third-party servers other than the configured AI provider endpoint.
- **Local Data**: Clipboard history and user settings reside locally within the application data directory.
