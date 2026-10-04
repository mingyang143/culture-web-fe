import {
  FilesetResolver,
  HandLandmarker,
  HandLandmarkerResult,
} from '@mediapipe/tasks-vision';

export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;

class HandLandmarkerService {
  private handLandmarker: HandLandmarker | null = null;
  private isInitializing = false;
  private currentRunningMode: 'IMAGE' | 'VIDEO' = 'IMAGE';

  /**
   * Initializes the HandLandmarker model via WASM + WebGL delegate
   */
  public async initialize(runningMode: 'IMAGE' | 'VIDEO' = 'IMAGE'): Promise<HandLandmarker> {
    if (this.handLandmarker && this.currentRunningMode === runningMode) {
      return this.handLandmarker;
    }

    if (this.handLandmarker && this.currentRunningMode !== runningMode) {
      await this.handLandmarker.setOptions({ runningMode });
      this.currentRunningMode = runningMode;
      return this.handLandmarker;
    }

    if (this.isInitializing) {
      // Wait until initialization completes
      while (this.isInitializing) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, 50); });
      }
      if (this.handLandmarker) return this.handLandmarker;
    }

    this.isInitializing = true;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode,
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.currentRunningMode = runningMode;
      return this.handLandmarker;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Detects 3D hand landmarks in a static image or canvas
   */
  public async detectImage(
    imageElement: HTMLImageElement | HTMLCanvasElement
  ): Promise<HandLandmarkerResult> {
    const landmarker = await this.initialize('IMAGE');
    return landmarker.detect(imageElement);
  }

  /**
   * Detects 3D hand landmarks in a video element at a specific timestamp
   */
  public async detectVideoFrame(
    videoElement: HTMLVideoElement,
    timestampMs: number
  ): Promise<HandLandmarkerResult> {
    const landmarker = await this.initialize('VIDEO');
    return landmarker.detectForVideo(videoElement, timestampMs);
  }
}

export const handLandmarkerService = new HandLandmarkerService();
