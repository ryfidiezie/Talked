export class GeminiLiveClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || "";
    this.voice = options.voice || "Puck";
    this.model = options.model || "models/gemini-3.8-live";
    this.systemInstruction = options.systemInstruction || "You are Talked, an ultra-fast desktop assistant. Respond concisely in spoken language. You have real-time vision of the user active computer screen: image frames are sent with user messages. You can see the full desktop, game windows, open applications, and UI controls. When the user asks you to locate, describe, or point to anything on screen (such as characters, buttons, or text), you CAN see it: inspect the provided image and immediately call drawOnScreen (with shape 'arrow', 'circle', 'line', or 'box') to visually point it out. Never state that you cannot see the screen when an image has been provided. You can type text directly into the user active application using typeText - use this when asked to type, write, insert, or dictate text. You have Google Search grounding enabled: you can search for current information automatically when asked about recent events, prices, or anything requiring up-to-date facts. You can read and write the clipboard using readClipboard and writeClipboard. You can get the active window using getActiveWindow. Do not use emojis or emdashes.";
    this.selectedDeviceId = options.selectedDeviceId || "default";

    this.ws = null;
    this.isConnected = false;
    this.isSetupComplete = false;
    this.isMuted = false;

    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.microphoneStream = null;
    this.processorNode = null;
    this.audioSourceNode = null;
    this.silentGainNode = null;
    this.levelInterval = null;
    this.inputPcmBuffer = [];
    this.preRollPcmBuffer = [];
    this.preRollMaxSamples = 3200;

    this.sensitivity = options.sensitivity || "medium";
    this.configuredThreshold = this.getThresholdForSensitivity(this.sensitivity);
    this.effectiveThreshold = this.configuredThreshold;
    this.noiseFloor = 0.03;

    this.consecutiveSpeechFrames = 0;
    this.speechFramesCount = 0;
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.hasSpoken = false;
    this.lastSpeechTime = 0;
    this.hangoverMs = 850;
    this.silenceTimeoutMs = 1000;
    this.minSpeechFrames = 4;
    this.lastTurnEndTime = 0;
    this.silenceCheckInterval = null;

    this.scheduledAudioSources = [];
    this.nextPlaybackTime = 0;
    this.outputSampleRate = 24000;

    this.onStateChange = options.onStateChange || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onError = options.onError || (() => {});
    this.onInterrupted = options.onInterrupted || (() => {});
    this.onMicLevel = options.onMicLevel || (() => {});
    this.onAudioTx = options.onAudioTx || (() => {});
    this.onToolCall = options.onToolCall || (async () => ({ success: true }));
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.onBeforeSpeechEnd = options.onBeforeSpeechEnd || null;
  }

  getThresholdForSensitivity(sens) {
    if (sens === "low") {
      return 0.22;
    }
    if (sens === "high") {
      return 0.05;
    }
    return 0.12;
  }

  setSensitivity(sens) {
    this.sensitivity = sens;
    this.configuredThreshold = this.getThresholdForSensitivity(sens);
    this.effectiveThreshold = Math.max(this.configuredThreshold, this.noiseFloor * 1.6 + 0.04);
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (muted) {
      this.hasSpoken = false;
      this.isSpeaking = false;
      this.speechFramesCount = 0;
      this.speechStartTime = 0;
      this.consecutiveSpeechFrames = 0;
      this.inputPcmBuffer = [];
      this.preRollPcmBuffer = [];
      this.stopPlayback();
    }
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  setVoice(voice) {
    this.voice = voice;
  }

  setModel(model) {
    this.model = model;
  }

  setSystemInstruction(instruction) {
    this.systemInstruction = instruction;
  }

  setDeviceId(deviceId) {
    this.selectedDeviceId = deviceId;
  }

  async getAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "audioinput");
    } catch (err) {
      return [];
    }
  }

  getFrequencyData(targetArray) {
    if (this.scheduledAudioSources.length > 0 && this.outputAnalyser) {
      this.outputAnalyser.getByteFrequencyData(targetArray);
      return true;
    }
    if (this.inputAnalyser && !this.isMuted) {
      this.inputAnalyser.getByteFrequencyData(targetArray);
      return true;
    }
    return false;
  }

  async resumeAudio() {
    if (this.inputAudioContext && this.inputAudioContext.state === "suspended") {
      try {
        await this.inputAudioContext.resume();
      } catch (e) {}
    }
    if (this.outputAudioContext && this.outputAudioContext.state === "suspended") {
      try {
        await this.outputAudioContext.resume();
      } catch (e) {}
    }
  }

  async initInputAudioContext() {
    if (!this.inputAudioContext || this.inputAudioContext.state === "closed") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.inputAudioContext = new AudioCtx();
    }
    if (this.inputAudioContext.state === "suspended") {
      await this.inputAudioContext.resume();
    }
  }

  async initOutputAudioContext() {
    if (!this.outputAudioContext || this.outputAudioContext.state === "closed") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.outputAudioContext = new AudioCtx({ sampleRate: this.outputSampleRate });
    }
    if (this.outputAudioContext.state === "suspended") {
      await this.outputAudioContext.resume();
    }

    if (!this.outputAnalyser) {
      this.outputAnalyser = this.outputAudioContext.createAnalyser();
      this.outputAnalyser.fftSize = 64;
      this.outputAnalyser.smoothingTimeConstant = 0.7;
      this.outputAnalyser.connect(this.outputAudioContext.destination);
    }
  }

  async startMicrophone(deviceId) {
    await this.initInputAudioContext();
    this.stopMicrophone();

    const targetDeviceId = deviceId || this.selectedDeviceId;
    let stream = null;

    if (targetDeviceId && targetDeviceId !== "default") {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: targetDeviceId,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false
          }
        });
      } catch (err) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false
          }
        });
      }
    } else {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        }
      });
    }

    this.microphoneStream = stream;

    try {
      this.inputAnalyser = this.inputAudioContext.createAnalyser();
      this.inputAnalyser.fftSize = 64;
      this.inputAnalyser.smoothingTimeConstant = 0.3;

      this.audioSourceNode = this.inputAudioContext.createMediaStreamSource(this.microphoneStream);
      this.audioSourceNode.connect(this.inputAnalyser);

      const bufferSize = 2048;
      const scriptProcessor = this.inputAudioContext.createScriptProcessor(bufferSize, 1, 1);
      const targetRate = 16000;
      const sourceRate = this.inputAudioContext.sampleRate;
      const resampleRatio = sourceRate / targetRate;

      this.silentGainNode = this.inputAudioContext.createGain();
      this.silentGainNode.gain.value = 0;

      scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);

        if (this.isMuted) {
          return;
        }

        const outputLength = Math.round(inputData.length / resampleRatio);
        const resampledSamples = [];

        for (let i = 0; i < outputLength; i++) {
          const index = i * resampleRatio;
          const lowerIndex = Math.floor(index);
          const upperIndex = Math.min(lowerIndex + 1, inputData.length - 1);
          const fraction = index - lowerIndex;
          const sample = inputData[lowerIndex] * (1 - fraction) + inputData[upperIndex] * fraction;
          const clamped = Math.max(-1, Math.min(1, sample));
          resampledSamples.push(clamped < 0 ? clamped * 32768 : clamped * 32767);
        }

        const isActivelyStreaming = this.isSpeaking || (this.hasSpoken && (Date.now() - this.lastSpeechTime < this.hangoverMs));

        if (isActivelyStreaming) {
          if (this.preRollPcmBuffer.length > 0) {
            this.inputPcmBuffer.push(...this.preRollPcmBuffer);
            this.preRollPcmBuffer = [];
          }
          this.inputPcmBuffer.push(...resampledSamples);
        } else {
          this.preRollPcmBuffer.push(...resampledSamples);
          if (this.preRollPcmBuffer.length > this.preRollMaxSamples) {
            this.preRollPcmBuffer.splice(0, this.preRollPcmBuffer.length - this.preRollMaxSamples);
          }
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isSetupComplete) {
          const chunkSize = 1600;
          while (this.inputPcmBuffer.length >= chunkSize) {
            const chunkSamples = this.inputPcmBuffer.splice(0, chunkSize);
            const chunk16 = new Int16Array(chunkSamples);
            this.sendPcmChunk(chunk16.buffer);
            this.onAudioTx();
          }
        } else if (this.inputPcmBuffer.length > 4800) {
          this.inputPcmBuffer = [];
        }
      };

      this.audioSourceNode.connect(scriptProcessor);
      scriptProcessor.connect(this.silentGainNode);
      this.silentGainNode.connect(this.inputAudioContext.destination);
      this.processorNode = scriptProcessor;

      if (this.levelInterval) {
        clearInterval(this.levelInterval);
      }
      const dataArr = new Uint8Array(32);
      this.levelInterval = setInterval(() => {
        if (this.inputAnalyser && !this.isMuted) {
          this.inputAnalyser.getByteFrequencyData(dataArr);
          let sum = 0;
          for (let i = 0; i < dataArr.length; i++) {
            sum += dataArr[i];
          }
          const avg = sum / dataArr.length;
          const level = Math.min(1, (avg / 255) * 2.0);
          this.onMicLevel(level, this.isSpeaking);

          const isSpeakerPlaying = this.scheduledAudioSources.length > 0;

          if (!this.isSpeaking && !isSpeakerPlaying && level < this.effectiveThreshold) {
            this.noiseFloor = this.noiseFloor * 0.94 + level * 0.06;
            this.effectiveThreshold = Math.max(this.configuredThreshold, this.noiseFloor * 1.6 + 0.04);
          }

          if (level > this.effectiveThreshold && !isSpeakerPlaying) {
            this.consecutiveSpeechFrames++;
            if (this.consecutiveSpeechFrames >= 3) {
              if (!this.isSpeaking) {
                this.isSpeaking = true;
                this.speechStartTime = Date.now();
                this.speechFramesCount = 0;
              }
              this.hasSpoken = true;
              this.lastSpeechTime = Date.now();
              this.speechFramesCount++;
            }
          } else {
            this.consecutiveSpeechFrames = 0;
            if (this.isSpeaking) {
              if (Date.now() - this.lastSpeechTime > this.hangoverMs) {
                this.isSpeaking = false;
              }
            }
          }
        } else {
          this.onMicLevel(0, false);
        }
      }, 35);

      if (this.silenceCheckInterval) {
        clearInterval(this.silenceCheckInterval);
      }
      this.silenceCheckInterval = setInterval(async () => {
        if (this.isMuted) {
          return;
        }

        const isSpeakerPlaying = this.scheduledAudioSources.length > 0;
        if (isSpeakerPlaying) {
          return;
        }

        const now = Date.now();
        const speechDuration = this.lastSpeechTime - this.speechStartTime;
        const silenceDuration = now - this.lastSpeechTime;

        if (this.hasSpoken && !this.isSpeaking && silenceDuration > this.silenceTimeoutMs) {
          if (this.speechFramesCount >= this.minSpeechFrames && speechDuration >= 350 && (now - this.lastTurnEndTime > 2000)) {
            this.hasSpoken = false;
            this.speechStartTime = 0;
            this.speechFramesCount = 0;
            this.lastTurnEndTime = now;

            if (this.onBeforeSpeechEnd) {
              await this.onBeforeSpeechEnd();
            }

            this.sendAudioStreamEnd();
            this.onStateChange("thinking");
            this.onSpeechEnd();
          } else {
            this.hasSpoken = false;
            this.speechStartTime = 0;
            this.speechFramesCount = 0;
            this.inputPcmBuffer = [];
          }
        }
      }, 100);

      return true;
    } catch (err) {
      this.onError("Audio processing setup error: " + err.message);
      return false;
    }
  }

  stopMicrophone() {
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }
    this.onMicLevel(0, false);
    this.inputPcmBuffer = [];
    this.preRollPcmBuffer = [];
    this.hasSpoken = false;
    this.isSpeaking = false;
    this.speechFramesCount = 0;
    this.speechStartTime = 0;
    this.consecutiveSpeechFrames = 0;

    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach((track) => track.stop());
      this.microphoneStream = null;
    }
    if (this.audioSourceNode) {
      try {
        this.audioSourceNode.disconnect();
      } catch (e) {}
      this.audioSourceNode = null;
    }
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch (e) {}
      this.processorNode = null;
    }
    if (this.silentGainNode) {
      try {
        this.silentGainNode.disconnect();
      } catch (e) {}
      this.silentGainNode = null;
    }
  }

  async connect() {
    if (!this.apiKey) {
      this.onError("API Key is missing. Click + to enter your Gemini API key.");
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.onStateChange("connecting");
    await this.initOutputAudioContext();

    const host = "generativelanguage.googleapis.com";
    const path = "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
    const url = `wss://${host}${path}?key=${encodeURIComponent(this.apiKey)}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.sendSetup();
    };

    this.ws.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) {
        data = await data.text();
      }
      try {
        const message = JSON.parse(data);
        this.handleServerMessage(message);
      } catch (err) {
        this.onError("JSON parse error: " + err.message);
      }
    };

    this.ws.onerror = () => {
      this.onError("Connection failed. Check API key and network.");
      this.onStateChange("error");
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      this.isSetupComplete = false;
      this.inputPcmBuffer = [];
      if (event.code !== 1000) {
        const reason = event.reason || "";
        const isQuota = reason.toLowerCase().includes("quota") || reason.toLowerCase().includes("rate") || reason.toLowerCase().includes("429");
        if (isQuota) {
          this.onError(`quota: Session closed (${event.code}): ${reason}`);
        } else {
          this.onError(`Session closed (${event.code}): ${reason || "Connection dropped"}`);
        }
      }
      this.onStateChange("idle");
    };
  }

  sendSetup() {
    const formattedModel = this.model.startsWith("models/") ? this.model : `models/${this.model}`;
    const setupMessage = {
      setup: {
        model: formattedModel,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voice
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: this.systemInstruction }]
        },
        inputAudioTranscription: {
          languageCodes: ["en-US"]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "drawOnScreen",
                description: "Draw visual shapes directly on the user computer screen (arrow, line, circle, or box) with glowing colors and labels to point out buttons, text, directions, or UI controls.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    shape: { type: "STRING", description: "Shape type: 'arrow', 'line', 'circle', or 'box'" },
                    x: { type: "NUMBER", description: "Target X percentage coordinate from 0 to 100" },
                    y: { type: "NUMBER", description: "Target Y percentage coordinate from 0 to 100" },
                    startX: { type: "NUMBER", description: "Start X percentage for line or arrow from 0 to 100" },
                    startY: { type: "NUMBER", description: "Start Y percentage for line or arrow from 0 to 100" },
                    endX: { type: "NUMBER", description: "End X percentage for line or arrow from 0 to 100" },
                    endY: { type: "NUMBER", description: "End Y percentage for line or arrow from 0 to 100" },
                    width: { type: "NUMBER", description: "Width or diameter percentage from 0 to 100" },
                    height: { type: "NUMBER", description: "Height percentage from 0 to 100" },
                    label: { type: "STRING", description: "Text label explaining what is pointed at" },
                    color: { type: "STRING", description: "Hex color code like #8ab4f8 (blue), #81c995 (green), #fdd663 (yellow), #f28b82 (red)" },
                    durationMs: { type: "NUMBER", description: "Duration in milliseconds before fading (default 5000)" }
                  },
                  required: ["shape"]
                }
              },
              {
                name: "getCursorPosition",
                description: "Get the current physical position of the user mouse cursor on the screen in screen percentage coordinates (x: 0-100, y: 0-100).",
                parameters: {
                  type: "OBJECT",
                  properties: {}
                }
              },
              {
                name: "highlightScreen",
                description: "Highlight a specific rectangular area on the user screen with a glowing border and label.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    x: { type: "NUMBER", description: "X percentage coordinate from 0 to 100" },
                    y: { type: "NUMBER", description: "Y percentage coordinate from 0 to 100" },
                    width: { type: "NUMBER", description: "Width percentage from 0 to 100" },
                    height: { type: "NUMBER", description: "Height percentage from 0 to 100" },
                    label: { type: "STRING", description: "Short description label" }
                  },
                  required: ["x", "y", "width", "height"]
                }
              },
              {
                name: "openApplication",
                description: "Open or launch a desktop application by name (e.g. spotify, notepad, code, chrome, discord).",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    appName: { type: "STRING", description: "Application name or process" }
                  },
                  required: ["appName"]
                }
              },
              {
                name: "openUrl",
                description: "Open a website URL in the user default web browser.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    url: { type: "STRING", description: "Web URL starting with http or https" }
                  },
                  required: ["url"]
                }
              },
              {
                name: "getSystemInfo",
                description: "Retrieve computer hardware information such as operating system, memory, and uptime.",
                parameters: {
                  type: "OBJECT",
                  properties: {}
                }
              },
              {
                name: "readClipboard",
                description: "Read the current text content of the user system clipboard. Use this to access whatever the user has copied.",
                parameters: {
                  type: "OBJECT",
                  properties: {}
                }
              },
              {
                name: "writeClipboard",
                description: "Write text to the user system clipboard so they can paste it anywhere.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    text: { type: "STRING", description: "Text to copy to the clipboard" }
                  },
                  required: ["text"]
                }
              },
              {
                name: "getActiveWindow",
                description: "Get the title and name of the window that was active before Talked was opened, so you know what app the user is working in.",
                parameters: {
                  type: "OBJECT",
                  properties: {}
                }
              },
              {
                name: "typeText",
                description: "Type text directly into the user currently active application by simulating keyboard input. Use this when the user asks you to type, write, insert, dictate, or fill in text. The text will be pasted into whatever app was in focus before Talked opened.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    text: { type: "STRING", description: "The exact text to type into the active application" }
                  },
                  required: ["text"]
                }
              }
            ]
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(setupMessage));
  }

  async handleServerMessage(message) {
    if (message.error) {
      const errText = message.error.message || JSON.stringify(message.error);
      this.onError(errText);
      this.onStateChange("error");
      return;
    }

    if (message.setupComplete !== undefined || message.setup_complete !== undefined) {
      this.isSetupComplete = true;
      this.onStateChange("listening");
      return;
    }

    const toolCall = message.toolCall || message.tool_call;
    if (toolCall) {
      const functionCalls = toolCall.functionCalls || toolCall.function_calls || [];
      for (const call of functionCalls) {
        const name = call.name;
        const args = call.args || {};
        const callId = call.id;
        try {
          const result = await this.onToolCall(name, args, callId);
          this.sendToolResponse(callId, result || { success: true });
        } catch (err) {
          this.sendToolResponse(callId, { success: false, error: err.message });
        }
      }
      return;
    }

    const serverContent = message.serverContent || message.server_content;
    if (!serverContent) {
      return;
    }

    if (serverContent.interrupted) {
      this.stopPlayback();
      this.onInterrupted();
      this.onStateChange("listening");
      return;
    }

    const inputTrans = serverContent.inputTranscription || serverContent.input_transcription;
    if (inputTrans && inputTrans.text) {
      const isFin = Boolean(inputTrans.finished || inputTrans.isFinal || inputTrans.is_final);
      this.onTranscript({
        type: "input",
        text: inputTrans.text,
        isFinal: isFin
      });
      if (isFin) {
        this.onStateChange("thinking");
      }
    }

    const outputTrans = serverContent.outputTranscription || serverContent.output_transcription;
    if (outputTrans && outputTrans.text) {
      this.onTranscript({
        type: "output",
        text: outputTrans.text,
        isFinal: false
      });
    }

    const modelTurn = serverContent.modelTurn || serverContent.model_turn;
    if (modelTurn && modelTurn.parts) {
      for (const part of modelTurn.parts) {
        const inlineData = part.inlineData || part.inline_data;
        if (inlineData && inlineData.data) {
          const mimeType = inlineData.mimeType || inlineData.mime_type || "";
          let rate = this.outputSampleRate;
          const match = mimeType.match(/rate=(\d+)/);
          if (match && match[1]) {
            rate = parseInt(match[1], 10);
          }
          this.queueAudioChunk(inlineData.data, rate);
          this.onStateChange("speaking");
        }
        if (part.text) {
          this.onTranscript({
            type: "text",
            text: part.text,
            isFinal: false
          });
          this.onStateChange("speaking");
        }
      }
    }

    if (serverContent.turnComplete || serverContent.turn_complete) {
      this.onTranscript({
        type: "output",
        text: "",
        isFinal: true
      });
      this.onStateChange("listening");
    }
  }

  sendToolResponse(callId, output) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      toolResponse: {
        functionResponses: [
          {
            response: { output: output },
            id: callId
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  sendImageChunk(base64Jpeg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return;
    }

    const message = {
      realtimeInput: {
        video: {
          mimeType: "image/jpeg",
          data: base64Jpeg
        },
        mediaChunks: [
          {
            mimeType: "image/jpeg",
            data: base64Jpeg
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  sendPcmChunk(arrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return;
    }

    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    const len = uint8.byteLength;
    const chunkSize = 1024;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, uint8.subarray(i, Math.min(i + chunkSize, len)));
    }
    const base64Audio = btoa(binary);

    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64Audio
          }
        ],
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Audio
        }
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  sendAudioStreamEnd() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return;
    }

    const message = {
      realtimeInput: {
        audioStreamEnd: true
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  sendTextMessage(text, imageBase64 = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onError("Connection not ready. Connect first.");
      return;
    }

    const parts = [];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64
        }
      });
    }
    parts.push({ text: text });

    const message = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: parts
          }
        ],
        turnComplete: true
      }
    };

    this.ws.send(JSON.stringify(message));
    this.onStateChange("thinking");
  }

  queueAudioChunk(base64Data, sampleRate) {
    if (!this.outputAudioContext) {
      return;
    }

    if (this.outputAudioContext.state === "suspended") {
      this.outputAudioContext.resume();
    }

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const int16Array = new Int16Array(bytes.buffer);
    const length = int16Array.length;
    const float32Array = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = this.outputAudioContext.createBuffer(1, length, sampleRate || this.outputSampleRate);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputAnalyser);

    const currentTime = this.outputAudioContext.currentTime;
    const startTime = Math.max(currentTime, this.nextPlaybackTime);
    source.start(startTime);

    this.nextPlaybackTime = startTime + audioBuffer.duration;
    this.scheduledAudioSources.push(source);

    source.onended = () => {
      const idx = this.scheduledAudioSources.indexOf(source);
      if (idx !== -1) {
        this.scheduledAudioSources.splice(idx, 1);
      }
      if (this.scheduledAudioSources.length === 0 && this.outputAudioContext.currentTime >= this.nextPlaybackTime - 0.05) {
        this.onStateChange("listening");
      }
    };
  }

  stopPlayback() {
    for (const source of this.scheduledAudioSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (err) {}
    }
    this.scheduledAudioSources = [];
    if (this.outputAudioContext) {
      this.nextPlaybackTime = this.outputAudioContext.currentTime;
    }
  }

  disconnect() {
    this.stopPlayback();
    this.stopMicrophone();

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    this.isConnected = false;
    this.isSetupComplete = false;
    this.inputPcmBuffer = [];
    this.preRollPcmBuffer = [];
    this.isSpeaking = false;
    this.hasSpoken = false;
    this.speechFramesCount = 0;
    this.speechStartTime = 0;
    this.consecutiveSpeechFrames = 0;
    this.onStateChange("idle");
  }
}
