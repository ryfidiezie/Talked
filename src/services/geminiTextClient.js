import { GeminiLiveClient } from "./geminiLiveClient";

export class GeminiTextClient extends GeminiLiveClient {
  sendSetup() {
    const formattedModel = this.model.startsWith("models/") ? this.model : `models/${this.model}`;
    const tools = this._buildToolDeclarations();
    const msg = {
      setup: {
        model: formattedModel,
        generationConfig: {
          responseModalities: ["TEXT"]
        },
        systemInstruction: {
          parts: [{ text: this.systemInstruction }]
        },
        tools: [{ functionDeclarations: tools }]
      }
    };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  _buildToolDeclarations() {
    return [
      {
        name: "drawOnScreen",
        description: "Draw a visual shape on screen (arrow, circle, line, box) to point something out.",
        parameters: {
          type: "OBJECT",
          properties: {
            shape: { type: "STRING" },
            x: { type: "NUMBER" },
            y: { type: "NUMBER" },
            startX: { type: "NUMBER" },
            startY: { type: "NUMBER" },
            endX: { type: "NUMBER" },
            endY: { type: "NUMBER" },
            width: { type: "NUMBER" },
            height: { type: "NUMBER" },
            label: { type: "STRING" },
            color: { type: "STRING" },
            durationMs: { type: "NUMBER" }
          },
          required: ["shape"]
        }
      },
      {
        name: "typeText",
        description: "Type text directly into the active application.",
        parameters: {
          type: "OBJECT",
          properties: { text: { type: "STRING" } },
          required: ["text"]
        }
      },
      {
        name: "openApplication",
        description: "Open a desktop application by name.",
        parameters: {
          type: "OBJECT",
          properties: { appName: { type: "STRING" } },
          required: ["appName"]
        }
      },
      {
        name: "openUrl",
        description: "Open a URL in the default browser.",
        parameters: {
          type: "OBJECT",
          properties: { url: { type: "STRING" } },
          required: ["url"]
        }
      },
      {
        name: "readClipboard",
        description: "Read the current clipboard text content.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "writeClipboard",
        description: "Write text to the clipboard.",
        parameters: {
          type: "OBJECT",
          properties: { text: { type: "STRING" } },
          required: ["text"]
        }
      },
      {
        name: "getActiveWindow",
        description: "Get the title of the previously active window.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "getSystemInfo",
        description: "Get system information (OS, memory, CPU).",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "getCursorPosition",
        description: "Get the current mouse cursor position as screen percentages.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "moveMouse",
        description: "Move the mouse cursor to absolute screen coordinates.",
        parameters: {
          type: "OBJECT",
          properties: {
            x: { type: "NUMBER", description: "Absolute screen X in pixels" },
            y: { type: "NUMBER", description: "Absolute screen Y in pixels" }
          },
          required: ["x", "y"]
        }
      },
      {
        name: "clickAt",
        description: "Click at a screen position with optional button choice.",
        parameters: {
          type: "OBJECT",
          properties: {
            x: { type: "NUMBER" },
            y: { type: "NUMBER" },
            button: { type: "STRING", description: "left or right" },
            double: { type: "BOOLEAN" }
          },
          required: ["x", "y"]
        }
      },
      {
        name: "runCommand",
        description: "Run a shell command (bash on Linux, PowerShell on Windows). The user will be asked to confirm before execution.",
        parameters: {
          type: "OBJECT",
          properties: { command: { type: "STRING" } },
          required: ["command"]
        }
      }
    ];
  }

  async send(text, imageBase64 = null) {
    if (!this.isConnected) {
      await this.connect();
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (this.isSetupComplete) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
        setTimeout(() => { clearInterval(interval); resolve(); }, 5000);
      });
    }
    this.sendTextMessage(text, imageBase64);
  }

  startMicrophone() {
    return Promise.resolve();
  }

  stopMicrophone() {}
}
