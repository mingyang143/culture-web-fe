import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Typography,
  Card,
  Select,
  Radio,
  Button,
  Progress,
  Alert,
  Tag,
  Space,
  Table,
  Upload,
  Spin,
  Switch,
  message,
  Flex,
  Divider,
} from 'antd';
import {
  CameraOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  BulbOutlined,
  TrophyOutlined,
  ReloadOutlined,
  CodeOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useStyleToken } from 'themeStyles';
import useIsMobile from 'utils/isMobile';
import {
  CANONICAL_MUDRAS,
  DEFAULT_MUDRA_ID,
  resolveCanonicalMudraId,
} from 'data/canonicalMudras';
import {
  extractHandKinematics,
  resolveHandedness,
  JOINT_TRIPLETS,
} from 'utils/mudraKinematics';
import {
  evaluateMudraKinematics,
  computeTemporalFeatureStats,
  stabilizeCoachingEvaluation,
} from 'utils/mudraEvaluator';
import { handLandmarkerService, HAND_CONNECTIONS } from 'services/handLandmarkerService';
import {
  MudraEvaluationResult,
  Landmark3D,
  JointEvaluation,
  CanonicalMudra,
  HandKinematics,
  TemporalFeatureStats,
  CoachingAnchorState,
} from 'types/mudra';

const { Title, Text, Paragraph } = Typography;

type InputMode = 'picture' | 'video' | 'webcam';

const HOLD_DURATION_MS = 2000; // 2.0-second continuous hold requirement
const TEMPORAL_WINDOW_SIZE = 30; // Rolling frame window for temporal variability

const SAMPLE_IMAGE_URLS = [
  {
    label: 'Sample 1: Pathaka (Hastalakshana Deepika #1)',
    url: '/samples/pataka_sample.jpg',
    mudraId: 'pathaka',
  },
  {
    label: 'Sample 2: Mudrakhyam (Hastalakshana Deepika #2)',
    url: '/samples/mudrakhya_sample.jpg',
    mudraId: 'mudrakhyam',
  },
  {
    label: 'Sample 3: Katakam (Hastalakshana Deepika #3)',
    url: '/samples/katakamukha_sample.jpg',
    mudraId: 'katakam',
  },
  {
    label: 'Sample 4: Mushti (Hastalakshana Deepika #4)',
    url: '/samples/musti_sample.jpg',
    mudraId: 'mushti',
  },
  {
    label: 'Sample 5: Thripathaka (Hastalakshana Deepika #17)',
    url: '/samples/tripataka_sample.jpg',
    mudraId: 'thripathaka',
  },
];

const getScoreStatus = (
  result: MudraEvaluationResult | null,
  isHoldMastered: boolean
): 'success' | 'normal' | 'exception' => {
  if (result?.measurementStatus === 'MEASUREMENT_UNAVAILABLE') return 'exception';
  if (isHoldMastered || result?.isMastered) return 'success';
  if ((result?.matchScore || 0) > 60) return 'normal';
  return 'exception';
};

const extractFeatureMapFromKinematics = (kin: HandKinematics): Record<string, number> => ({
  'thumb.mcp': kin.thumb.mcp,
  'thumb.pip': kin.thumb.pip,
  'index.mcp': kin.index.mcp,
  'index.pip': kin.index.pip,
  'index.dip': kin.index.dip ?? 0,
  'middle.mcp': kin.middle.mcp,
  'middle.pip': kin.middle.pip,
  'middle.dip': kin.middle.dip ?? 0,
  'ring.mcp': kin.ring.mcp,
  'ring.pip': kin.ring.pip,
  'ring.dip': kin.ring.dip ?? 0,
  'pinky.mcp': kin.pinky.mcp,
  'pinky.pip': kin.pinky.pip,
  'pinky.dip': kin.pinky.dip ?? 0,
  spreadThumbIndex: kin.spreadThumbIndex,
  spreadIndexMiddle: kin.spreadIndexMiddle,
  spreadMiddleRing: kin.spreadMiddleRing,
  spreadRingPinky: kin.spreadRingPinky,
  'closure.index': kin.fingerClosure.index,
  'closure.middle': kin.fingerClosure.middle,
  'closure.ring': kin.fingerClosure.ring,
  'closure.pinky': kin.fingerClosure.pinky,
  'contact.thumbIndex': kin.tipDistances.thumbIndex * 100,
  'contact.thumbMiddle': kin.tipDistances.thumbMiddle * 100,
  'contact.thumbRing': kin.tipDistances.thumbRing * 100,
  'contact.thumbPinky': kin.tipDistances.thumbPinky * 100,
});

const MudraPracticePage: React.FC = () => {
  const isMobile = useIsMobile();
  const styleToken = useStyleToken();
  const { mudraId } = useParams<{ mudraId?: string }>();
  const navigate = useNavigate();

  const [selectedMudraId, setSelectedMudraId] = useState<string>(() =>
    resolveCanonicalMudraId(mudraId)
  );

  useEffect(() => {
    if (mudraId) {
      setSelectedMudraId(resolveCanonicalMudraId(mudraId));
    }
  }, [mudraId]);

  const [inputMode, setInputMode] = useState<InputMode>('picture');
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(() => {
    const initialId = resolveCanonicalMudraId(mudraId);
    return CANONICAL_MUDRAS[initialId]?.referenceImageUrl || SAMPLE_IMAGE_URLS[0].url;
  });
  const [evaluationResult, setEvaluationResult] = useState<MudraEvaluationResult | null>(null);
  const [latestKinematics, setLatestKinematics] = useState<HandKinematics | null>(null);
  const [handednessScore, setHandednessScore] = useState<number | null>(null);
  const [isHandDetected2D, setIsHandDetected2D] = useState<boolean>(false);
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);

  // Optional Developer Diagnostics state
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [temporalStatsMap, setTemporalStatsMap] = useState<Record<string, TemporalFeatureStats>>({});
  const [capturedSnapshotJson, setCapturedSnapshotJson] = useState<string>('');
  const featureHistoryRef = useRef<Record<string, number[]>>({});

  // 2.0-second continuous hold timer state & refs
  const [holdProgressMs, setHoldProgressMs] = useState<number>(0);
  const [isHoldMastered, setIsHoldMastered] = useState<boolean>(false);
  const holdElapsedMsRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const masteredLockedRef = useRef<boolean>(false);
  const isDetectingFrameRef = useRef<boolean>(false);
  const coachingAnchorRef = useRef<CoachingAnchorState | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  const currentMudra = CANONICAL_MUDRAS[selectedMudraId] || CANONICAL_MUDRAS[DEFAULT_MUDRA_ID];
  const currentMudraRef = useRef<CanonicalMudra>(currentMudra);
  currentMudraRef.current = currentMudra;

  const resetTemporalHistory = useCallback(() => {
    featureHistoryRef.current = {};
    setTemporalStatsMap({});
  }, []);

  const recordKinematicsSample = useCallback((kin: HandKinematics) => {
    const sampleMap = extractFeatureMapFromKinematics(kin);
    const history = featureHistoryRef.current;
    const nextStats: Record<string, TemporalFeatureStats> = {};

    Object.entries(sampleMap).forEach(([key, value]) => {
      const prev = history[key] || [];
      const updated = [...prev.slice(-(TEMPORAL_WINDOW_SIZE - 1)), value];
      history[key] = updated;
      nextStats[key] = computeTemporalFeatureStats(updated);
    });

    setTemporalStatsMap(nextStats);
  }, []);

  const resetHoldTimer = useCallback(() => {
    holdElapsedMsRef.current = 0;
    lastFrameTimeRef.current = null;
    masteredLockedRef.current = false;
    coachingAnchorRef.current = null;
    setHoldProgressMs(0);
    setIsHoldMastered(false);
  }, []);

  const stopWebcam = useCallback(() => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }
    isDetectingFrameRef.current = false;
    setIsWebcamActive(false);
  }, []);

  // Reset hold timer, temporal history, and default sample image when switching mudras
  useEffect(() => {
    resetHoldTimer();
    resetTemporalHistory();
    setSelectedImageUrl((prevUrl) => {
      const isBuiltInSample = SAMPLE_IMAGE_URLS.some((s) => s.url === prevUrl);
      if (!isBuiltInSample) return prevUrl;
      const matchingSample = SAMPLE_IMAGE_URLS.find((s) => s.mudraId === selectedMudraId);
      return matchingSample ? matchingSample.url : prevUrl;
    });
  }, [selectedMudraId, resetHoldTimer, resetTemporalHistory]);

  // Initialize MediaPipe model
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setIsLoadingModel(true);
        await handLandmarkerService.initialize('IMAGE');
        if (isMounted) {
          message.success('MediaPipe 3D Hand Landmarker initialized');
        }
      } catch (err) {
        console.error('Failed to initialize MediaPipe:', err);
        if (isMounted) {
          message.error('Failed to load MediaPipe Hand Landmarker model');
        }
      } finally {
        if (isMounted) setIsLoadingModel(false);
      }
    })();

    return () => {
      isMounted = false;
      stopWebcam();
    };
  }, [stopWebcam]);

  // Draw 21 image-normalized landmarks and skeletal bones onto canvas
  const drawSkeleton = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      landmarks: Landmark3D[],
      width: number,
      height: number,
      evalRes: MudraEvaluationResult | null
    ) => {
      const handConnections = HAND_CONNECTIONS || [];
      const isUnavailable = evalRes?.measurementStatus === 'MEASUREMENT_UNAVAILABLE';

      // Determine global joint status map if valid evaluation result exists
      const jointStatusMap: Record<number, 'CORRECT' | 'MINOR_DEVIATION' | 'INCORRECT'> = {};
      if (evalRes && !isUnavailable) {
        const rank = (s: 'CORRECT' | 'MINOR_DEVIATION' | 'INCORRECT') => {
          if (s === 'INCORRECT') return 3;
          if (s === 'MINOR_DEVIATION') return 2;
          return 1;
        };

        const setStatus = (
          indices: number[],
          status: 'CORRECT' | 'MINOR_DEVIATION' | 'INCORRECT'
        ) => {
          indices.forEach((idx) => {
            const current = jointStatusMap[idx] || 'CORRECT';
            if (rank(status) > rank(current)) {
              jointStatusMap[idx] = status;
            }
          });
        };

        evalRes.jointEvaluations.forEach((je) => {
          const { status } = je;
          if (je.jointKey === 'thumb.mcp') {
            setStatus([1, 2, 3], status);
          } else if (je.jointKey === 'thumb.pip') {
            setStatus([3, 4], status);
          } else if (je.jointKey === 'index.mcp') {
            setStatus([5, 6], status);
          } else if (je.jointKey === 'index.pip') {
            setStatus([6, 7, 8], status);
          } else if (je.jointKey === 'middle.mcp') {
            setStatus([9, 10], status);
          } else if (je.jointKey === 'middle.pip') {
            setStatus([10, 11, 12], status);
          } else if (je.jointKey === 'ring.mcp') {
            setStatus([13, 14], status);
          } else if (je.jointKey === 'ring.pip') {
            setStatus([14, 15, 16], status);
          } else if (je.jointKey === 'pinky.mcp') {
            setStatus([17, 18], status);
          } else if (je.jointKey === 'pinky.pip') {
            setStatus([18, 19, 20], status);
          } else if (je.jointKey === 'spreadIndexMiddle') {
            setStatus([5, 6, 9, 10], status);
          } else if (je.jointKey === 'spreadMiddleRing') {
            setStatus([9, 10, 13, 14], status);
          } else if (je.jointKey === 'spreadRingPinky') {
            setStatus([13, 14, 17, 18], status);
          } else if (je.jointKey === 'contact.thumbIndex') {
            setStatus([4, 8], status);
          } else if (je.jointKey === 'contact.thumbMiddle') {
            setStatus([4, 12], status);
          } else if (je.jointKey === 'contact.thumbRing') {
            setStatus([4, 16], status);
          } else if (je.jointKey === 'contact.thumbPinky') {
            setStatus([4, 20], status);
          }
        });
      }

      // Draw bones
      ctx.lineWidth = 3;
      handConnections.forEach(({ start, end }) => {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        if (!p1 || !p2) return;

        const x1 = p1.x * width;
        const y1 = p1.y * height;
        const x2 = p2.x * width;
        const y2 = p2.y * height;

        if (isUnavailable) {
          ctx.strokeStyle = '#9CA3AF'; // Neutral gray when 3D measurement is unavailable
        } else {
          const startStatus = jointStatusMap[start] || 'CORRECT';
          const endStatus = jointStatusMap[end] || 'CORRECT';

          if (startStatus === 'INCORRECT' || endStatus === 'INCORRECT') {
            ctx.strokeStyle = '#EF4444'; // Red
          } else if (startStatus === 'MINOR_DEVIATION' || endStatus === 'MINOR_DEVIATION') {
            ctx.strokeStyle = '#F59E0B'; // Amber
          } else {
            ctx.strokeStyle = '#10B981'; // Green
          }
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      // Draw dashed connector for required fingertip pinch contacts if broken
      if (evalRes && !isUnavailable) {
        const contactPairs: Array<{ key: string; idxA: number; idxB: number }> = [
          { key: 'contact.thumbIndex', idxA: 4, idxB: 8 },
          { key: 'contact.thumbMiddle', idxA: 4, idxB: 12 },
          { key: 'contact.thumbRing', idxA: 4, idxB: 16 },
          { key: 'contact.thumbPinky', idxA: 4, idxB: 20 },
        ];

        contactPairs.forEach(({ key, idxA, idxB }) => {
          const contactEval = evalRes.jointEvaluations.find((je) => je.jointKey === key);
          if (contactEval && contactEval.status !== 'CORRECT') {
            const pA = landmarks[idxA];
            const pB = landmarks[idxB];
            if (pA && pB) {
              ctx.save();
              ctx.setLineDash([5, 5]);
              ctx.lineWidth = 2.5;
              ctx.strokeStyle = contactEval.status === 'INCORRECT' ? '#EF4444' : '#F59E0B';
              ctx.beginPath();
              ctx.moveTo(pA.x * width, pA.y * height);
              ctx.lineTo(pB.x * width, pB.y * height);
              ctx.stroke();
              ctx.restore();
            }
          }
        });
      }

      // Draw landmark nodes
      landmarks.forEach((p, idx) => {
        const x = p.x * width;
        const y = p.y * height;
        const status = jointStatusMap[idx] || 'CORRECT';

        ctx.beginPath();
        const radius = [4, 8, 12, 16, 20].includes(idx) ? 6 : 4.5;
        ctx.arc(x, y, radius, 0, 2 * Math.PI);

        if (isUnavailable) {
          ctx.fillStyle = '#9CA3AF';
        } else if (status === 'INCORRECT') {
          ctx.fillStyle = '#EF4444';
        } else if (status === 'MINOR_DEVIATION') {
          ctx.fillStyle = '#F59E0B';
        } else {
          ctx.fillStyle = '#10B981';
        }
        ctx.fill();

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
      });
    },
    []
  );

  // Process a static image using worldLandmarks for assessment and landmarks for overlay
  const analyzeImage = useCallback(
    async (imgElement: HTMLImageElement) => {
      if (!canvasRef.current) return;
      setIsProcessing(true);

      try {
        const result = await handLandmarkerService.detectImage(imgElement);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = imgElement.naturalWidth || imgElement.width || 640;
        canvas.height = imgElement.naturalHeight || imgElement.height || 480;

        // Draw background image
        ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

        const has2DHand = Boolean(result.landmarks && result.landmarks.length > 0);
        setIsHandDetected2D(has2DHand);

        if (has2DHand) {
          const firstOverlayLandmarks = result.landmarks[0];
          const firstWorldLandmarks = result.worldLandmarks?.[0];
          const handCategories = result.handedness?.[0] ?? result.handednesses?.[0];
          const handedness = resolveHandedness(handCategories);
          const rawScore = handCategories?.[0]?.score;
          setHandednessScore(typeof rawScore === 'number' ? rawScore : null);

          // Extract kinematics strictly from 3D worldLandmarks (never fallback to 2D landmarks)
          const kinematics = extractHandKinematics(firstWorldLandmarks, handedness);
          setLatestKinematics(kinematics);

          const evalRes = evaluateMudraKinematics(kinematics, currentMudraRef.current);
          setEvaluationResult(evalRes);

          if (kinematics) {
            recordKinematicsSample(kinematics);
          }

          if (evalRes.measurementStatus === 'VALID' && evalRes.isMastered) {
            holdElapsedMsRef.current = HOLD_DURATION_MS;
            masteredLockedRef.current = true;
            setHoldProgressMs(HOLD_DURATION_MS);
            setIsHoldMastered(true);
          } else {
            resetHoldTimer();
          }

          // Render 2D overlay skeleton
          drawSkeleton(ctx, firstOverlayLandmarks, canvas.width, canvas.height, evalRes);
        } else {
          setLatestKinematics(null);
          setHandednessScore(null);
          setEvaluationResult(null);
          resetHoldTimer();
          message.warning('No hand detected in the image. Try a clearer hand photo.');
        }
      } catch (err) {
        console.error('Error analyzing image:', err);
        setLatestKinematics(null);
        setEvaluationResult(null);
        resetHoldTimer();
        message.error('Failed to analyze hand image.');
      } finally {
        setIsProcessing(false);
      }
    },
    [drawSkeleton, recordKinematicsSample, resetHoldTimer]
  );

  // Re-run analysis when mudra changes, image loads, or model finishes loading
  useEffect(() => {
    if (
      inputMode === 'picture' &&
      !isLoadingModel &&
      imageRef.current &&
      imageRef.current.complete
    ) {
      analyzeImage(imageRef.current);
    }
  }, [selectedMudraId, selectedImageUrl, inputMode, isLoadingModel, analyzeImage]);

  // Video frame loop with concurrency guard and 2.0-second continuous hold accumulator
  const processVideoFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.paused || video.ended || video.readyState < 2) return;

    // Schedule next animation frame while video is active
    animationFrameIdRef.current = requestAnimationFrame(processVideoFrame);

    // Prevent overlapping async detectVideoFrame executions
    if (isDetectingFrameRef.current) return;
    isDetectingFrameRef.current = true;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      isDetectingFrameRef.current = false;
      return;
    }

    const now = performance.now();
    const dt = lastFrameTimeRef.current ? Math.min(now - lastFrameTimeRef.current, 200) : 33;
    lastFrameTimeRef.current = now;

    (async () => {
      try {
        const result = await handLandmarkerService.detectVideoFrame(video, now);

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const has2DHand = Boolean(result.landmarks && result.landmarks.length > 0);
        setIsHandDetected2D(has2DHand);

        if (has2DHand) {
          const firstOverlayHand = result.landmarks[0];
          const firstWorldHand = result.worldLandmarks?.[0];
          const handCategories = result.handedness?.[0] ?? result.handednesses?.[0];
          const handedness = resolveHandedness(handCategories);
          const rawScore = handCategories?.[0]?.score;
          setHandednessScore(typeof rawScore === 'number' ? rawScore : null);

          // Strictly use 3D worldLandmarks for assessment; do not fallback to image landmarks
          const kinematics = extractHandKinematics(firstWorldHand, handedness);
          setLatestKinematics(kinematics);

          const rawEvalRes = evaluateMudraKinematics(kinematics, currentMudraRef.current);
          const { stabilizedEval: evalRes, nextAnchor } = stabilizeCoachingEvaluation(
            rawEvalRes,
            kinematics,
            coachingAnchorRef.current,
            now
          );
          coachingAnchorRef.current = nextAnchor;
          setEvaluationResult(evalRes);

          if (kinematics) {
            recordKinematicsSample(kinematics);
          }

          if (evalRes.measurementStatus === 'MEASUREMENT_UNAVAILABLE') {
            // Prevent hold-time accumulation when 3D world landmarks are unavailable
            if (!masteredLockedRef.current) {
              holdElapsedMsRef.current = 0;
              setHoldProgressMs(0);
            }
          } else if (!masteredLockedRef.current) {
            if (evalRes.isMastered) {
              holdElapsedMsRef.current = Math.min(
                HOLD_DURATION_MS,
                holdElapsedMsRef.current + dt
              );
              if (holdElapsedMsRef.current >= HOLD_DURATION_MS) {
                masteredLockedRef.current = true;
                setIsHoldMastered(true);
                message.success(
                  `🎉 Mudra Mastered! You held ${currentMudraRef.current.name} steadily for 2.0 seconds!`
                );
              }
            } else if (evalRes.matchScore < 70) {
              holdElapsedMsRef.current = 0;
            } else {
              // Gentle decay on minor single-frame jitter
              holdElapsedMsRef.current = Math.max(0, holdElapsedMsRef.current - dt * 1.5);
            }
            setHoldProgressMs(Math.round(holdElapsedMsRef.current));
          }

          drawSkeleton(ctx, firstOverlayHand, canvas.width, canvas.height, evalRes);
        } else {
          // Tracking lost: clear stale kinematics/evaluation and reset unmastered hold timer
          coachingAnchorRef.current = null;
          setLatestKinematics(null);
          setHandednessScore(null);
          setEvaluationResult(null);
          if (!masteredLockedRef.current) {
            holdElapsedMsRef.current = 0;
            setHoldProgressMs(0);
          }
        }
      } catch {
        // Frame skip on transient MediaPipe error
      } finally {
        isDetectingFrameRef.current = false;
      }
    })();
  }, [drawSkeleton, recordKinematicsSample]);

  // Start webcam
  const startWebcam = async () => {
    try {
      stopWebcam();
      resetHoldTimer();
      resetTemporalHistory();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      webcamStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsWebcamActive(true);
          lastFrameTimeRef.current = performance.now();
          animationFrameIdRef.current = requestAnimationFrame(processVideoFrame);
        };
      }
    } catch (err) {
      console.error('Webcam permission error:', err);
      message.error('Unable to access webcam. Check browser permissions.');
    }
  };

  const handleModeChange = (mode: InputMode) => {
    stopWebcam();
    resetHoldTimer();
    resetTemporalHistory();
    setInputMode(mode);
    setEvaluationResult(null);
    setLatestKinematics(null);

    if (mode === 'picture') {
      setTimeout(() => {
        if (imageRef.current) analyzeImage(imageRef.current);
      }, 100);
    }
  };

  const handleCaptureCalibrationSnapshot = () => {
    const snapshot = {
      capturedAt: new Date().toISOString(),
      mudraId: currentMudra.id,
      mudraName: currentMudra.name,
      inputMode,
      coordinateSource:
        evaluationResult?.coordinateSource || (latestKinematics ? 'worldLandmarks' : 'unavailable'),
      measurementStatus: evaluationResult?.measurementStatus || 'MEASUREMENT_UNAVAILABLE',
      handedness: latestKinematics?.handedness || 'Unknown',
      handednessConfidence:
        handednessScore !== null ? Number(handednessScore.toFixed(3)) : null,
      palmScaleMeters:
        latestKinematics ? Number(latestKinematics.palmScaleMeters.toFixed(4)) : null,
      palmWidthMeters:
        latestKinematics ? Number(latestKinematics.palmWidthMeters.toFixed(4)) : null,
      matchScore: evaluationResult?.matchScore ?? 0,
      kinematics: latestKinematics,
      jointEvaluations: evaluationResult?.jointEvaluations ?? [],
      temporalVariability: temporalStatsMap,
    };

    const jsonText = JSON.stringify(snapshot, null, 2);
    setCapturedSnapshotJson(jsonText);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(jsonText)
        .then(() => {
          message.success('Captured calibration snapshot JSON to clipboard');
        })
        .catch(() => {
          message.info('Captured calibration snapshot below');
        });
    } else {
      message.info('Captured calibration snapshot below');
    }
  };

  const holdPercent = Math.min(100, Math.round((holdProgressMs / HOLD_DURATION_MS) * 100));
  const holdSecondsText = (holdProgressMs / 1000).toFixed(1);

  const jointColumns = [
    {
      title: 'Joint / Parameter',
      dataIndex: 'label',
      key: 'label',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Actual',
      dataIndex: 'currentDegrees',
      key: 'currentDegrees',
      render: (deg: number) => `${deg}°`,
    },
    {
      title: 'Target',
      dataIndex: 'targetDegrees',
      key: 'targetDegrees',
      render: (deg: number) => `${deg}°`,
    },
    {
      title: 'Discrepancy (Δθ)',
      dataIndex: 'deltaDegrees',
      key: 'deltaDegrees',
      render: (delta: number) => {
        const sign = delta > 0 ? `+${delta}°` : `${delta}°`;
        return <Text type={Math.abs(delta) > 20 ? 'danger' : 'secondary'}>{sign}</Text>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: JointEvaluation['status']) => {
        if (status === 'CORRECT') {
          return <Tag color="success">Match</Tag>;
        }
        if (status === 'MINOR_DEVIATION') {
          return <Tag color="warning">Slight Off</Tag>;
        }
        return <Tag color="error">Misaligned</Tag>;
      },
    },
  ];

  const diagnosticColumns = [
    {
      title: 'Feature',
      dataIndex: 'label',
      key: 'label',
      render: (text: string, record: JointEvaluation) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: '11px' }}>
            {record.jointKey}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Triplet',
      dataIndex: 'triplet',
      key: 'triplet',
      render: (triplet?: string) => <Tag>{triplet || 'N/A'}</Tag>,
    },
    {
      title: 'Measured',
      dataIndex: 'rawValue',
      key: 'rawValue',
      render: (rawValue: number | undefined, record: JointEvaluation) => {
        const isContact = record.jointKey.startsWith('contact.');
        const val = rawValue ?? record.currentDegrees;
        return isContact ? `${val}% palm` : `${val}°`;
      },
    },
    {
      title: 'Target Range',
      key: 'acceptedRange',
      render: (_: unknown, record: JointEvaluation) => {
        const isContact = record.jointKey.startsWith('contact.');
        if (isContact) {
          return `≤ ${record.targetDegrees}% palm`;
        }
        const [minDeg, maxDeg] = record.acceptedRange || [
          record.targetDegrees - (record.toleranceDegrees || 0),
          record.targetDegrees + (record.toleranceDegrees || 0),
        ];
        return `${record.targetDegrees}° ± ${record.toleranceDegrees ?? 0}° [${minDeg}°..${maxDeg}°]`;
      },
    },
    {
      title: 'Signed Error',
      dataIndex: 'deltaDegrees',
      key: 'deltaDegrees',
      render: (delta: number, record: JointEvaluation) => {
        const unit = record.jointKey.startsWith('contact.') ? '%' : '°';
        const sign = delta > 0 ? `+${delta}${unit}` : `${delta}${unit}`;
        return <Text type={record.status === 'INCORRECT' ? 'danger' : 'secondary'}>{sign}</Text>;
      },
    },
    {
      title: 'Score Contribution (w / penalty)',
      key: 'scoreContribution',
      render: (_: unknown, record: JointEvaluation) =>
        `w=${record.weight ?? 1.0} | pen=${record.weightedPenalty ?? 0}`,
    },
    {
      title: `Temporal Variability (n≤${TEMPORAL_WINDOW_SIZE})`,
      key: 'temporalVariability',
      render: (_: unknown, record: JointEvaluation) => {
        const stats = temporalStatsMap[record.jointKey];
        if (!stats || stats.sampleCount === 0) return '—';
        return `${stats.mean}° ± ${stats.stdDev}° [${stats.min}..${stats.max}] (n=${stats.sampleCount})`;
      },
    },
  ];

  const isMeasurementUnavailable =
    evaluationResult?.measurementStatus === 'MEASUREMENT_UNAVAILABLE';

  let coachAlertMessage = 'Actionable Adjustment';
  if (isMeasurementUnavailable) {
    coachAlertMessage = 'Measurement Unavailable (3D World Landmarks Missing)';
  } else if (isHoldMastered) {
    coachAlertMessage = 'Mudra Mastered! 2.0-Second Continuous Hold Complete.';
  } else if (evaluationResult?.isMastered) {
    coachAlertMessage = 'Great Form! Hold steady for 2.0 seconds to master...';
  }

  let coachAlertIcon = <BulbOutlined />;
  if (isHoldMastered) {
    coachAlertIcon = <TrophyOutlined />;
  } else if (evaluationResult?.isMastered) {
    coachAlertIcon = <CheckCircleOutlined />;
  } else if (isMeasurementUnavailable) {
    coachAlertIcon = <ExclamationCircleOutlined />;
  }

  let coachAlertType: 'success' | 'warning' | 'error' = 'warning';
  if (isMeasurementUnavailable) {
    coachAlertType = 'error';
  } else if (isHoldMastered || evaluationResult?.isMastered) {
    coachAlertType = 'success';
  }

  let holdProgressStatus: 'success' | 'active' | 'normal' = 'normal';
  if (isHoldMastered) {
    holdProgressStatus = 'success';
  } else if (holdPercent > 0) {
    holdProgressStatus = 'active';
  }

  const auxiliaryClosureRows = latestKinematics
    ? [
        {
          key: 'index',
          finger: 'Index',
          dipTriplet: JOINT_TRIPLETS['index.dip'],
          dipDeg: Number((latestKinematics.index.dip ?? 0).toFixed(2)),
          closurePair: '8↔5 / 0↔9',
          closureDist: Number(latestKinematics.fingerClosure.index.toFixed(3)),
          closureStats: temporalStatsMap['closure.index'],
          dipStats: temporalStatsMap['index.dip'],
        },
        {
          key: 'middle',
          finger: 'Middle',
          dipTriplet: JOINT_TRIPLETS['middle.dip'],
          dipDeg: Number((latestKinematics.middle.dip ?? 0).toFixed(2)),
          closurePair: '12↔9 / 0↔9',
          closureDist: Number(latestKinematics.fingerClosure.middle.toFixed(3)),
          closureStats: temporalStatsMap['closure.middle'],
          dipStats: temporalStatsMap['middle.dip'],
        },
        {
          key: 'ring',
          finger: 'Ring',
          dipTriplet: JOINT_TRIPLETS['ring.dip'],
          dipDeg: Number((latestKinematics.ring.dip ?? 0).toFixed(2)),
          closurePair: '16↔13 / 0↔9',
          closureDist: Number(latestKinematics.fingerClosure.ring.toFixed(3)),
          closureStats: temporalStatsMap['closure.ring'],
          dipStats: temporalStatsMap['ring.dip'],
        },
        {
          key: 'pinky',
          finger: 'Pinky',
          dipTriplet: JOINT_TRIPLETS['pinky.dip'],
          dipDeg: Number((latestKinematics.pinky.dip ?? 0).toFixed(2)),
          closurePair: '20↔17 / 0↔9',
          closureDist: Number(latestKinematics.fingerClosure.pinky.toFixed(3)),
          closureStats: temporalStatsMap['closure.pinky'],
          dipStats: temporalStatsMap['pinky.dip'],
        },
      ]
    : [];

  return (
    <Flex
      vertical
      style={{
        padding: isMobile ? '1rem' : '2rem',
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Page Header */}
      <Flex justify="space-between" align="center" wrap="wrap" style={{ marginBottom: '1.5rem' }}>
        <div>
          <Title
            level={2}
            style={{ margin: 0, color: styleToken.culture.cultureSectionHeadingTextStyle.color }}
          >
            MudraGuide: 3D Hand Pose Analysis & Feedback
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Real-time kinematic joint angle analysis for Kathakali Mudras powered by MediaPipe 3D
            World Landmarks.
          </Paragraph>
        </div>

        <Space wrap style={{ marginTop: isMobile ? '1rem' : 0 }}>
          <Space>
            <CodeOutlined />
            <Text>Developer Diagnostics:</Text>
            <Switch
              checked={showDiagnostics}
              onChange={(checked) => setShowDiagnostics(checked)}
              aria-label="Toggle Developer Diagnostics"
            />
          </Space>
          <Divider type="vertical" />
          <Text strong>Select Mudra:</Text>
          <Select
            value={selectedMudraId}
            style={{ width: 220 }}
            onChange={(val) => {
              setSelectedMudraId(val);
              navigate(`/learn/mudras/practice/${val}`, { replace: true });
            }}
            options={Object.values(CANONICAL_MUDRAS).map((m) => ({
              label: `${m.name} (${m.malayalamName})`,
              value: m.id,
            }))}
          />
        </Space>
      </Flex>

      {/* Input Mode Selector */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <Flex justify="space-between" align="center" wrap="wrap">
          <Radio.Group
            value={inputMode}
            onChange={(e) => handleModeChange(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="picture">
              <PictureOutlined /> Picture Mode (Static Image)
            </Radio.Button>
            <Radio.Button value="video">
              <VideoCameraOutlined /> Video Mode (Recorded Clip)
            </Radio.Button>
            <Radio.Button value="webcam">
              <CameraOutlined /> Live Webcam
            </Radio.Button>
          </Radio.Group>

          {inputMode === 'picture' && (
            <Space wrap style={{ marginTop: isMobile ? '0.5rem' : 0 }}>
              <Select
                value={selectedImageUrl}
                style={{ width: isMobile ? '100%' : 280 }}
                onChange={(url) => setSelectedImageUrl(url)}
                options={SAMPLE_IMAGE_URLS.map((s) => ({ label: s.label, value: s.url }))}
              />
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  const url = URL.createObjectURL(file);
                  setSelectedImageUrl(url);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />}>Upload Hand Photo</Button>
              </Upload>
            </Space>
          )}

          {inputMode === 'webcam' && (
            <Space>
              {isHoldMastered && (
                <Button icon={<ReloadOutlined />} onClick={resetHoldTimer}>
                  Reset 2s Hold
                </Button>
              )}
              <Button
                type={isWebcamActive ? 'default' : 'primary'}
                danger={isWebcamActive}
                onClick={isWebcamActive ? stopWebcam : startWebcam}
              >
                {isWebcamActive ? 'Stop Webcam' : 'Start Webcam'}
              </Button>
            </Space>
          )}
        </Flex>
      </Card>

      {/* Main Studio View: Dual Pane */}
      <Flex gap="1.5rem" vertical={isMobile}>
        {/* Left Pane: Media Canvas & Skeleton */}
        <Card
          title={
            <Flex justify="space-between" align="center">
              <span>Hand Landmark Visualizer</span>
              {isProcessing && <Spin size="small" />}
            </Flex>
          }
          style={{ flex: 1.2 }}
        >
          {isLoadingModel ? (
            <Flex justify="center" align="center" style={{ minHeight: '360px' }}>
              <Spin tip="Loading MediaPipe WASM model..." />
            </Flex>
          ) : (
            <div
              style={{
                position: 'relative',
                width: '100%',
                minHeight: '360px',
                backgroundColor: '#111827',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              {/* Hidden sources */}
              {inputMode === 'picture' && (
                <img
                  ref={imageRef}
                  src={selectedImageUrl}
                  alt="Mudra Input"
                  crossOrigin="anonymous"
                  onLoad={() => {
                    if (imageRef.current) analyzeImage(imageRef.current);
                  }}
                  style={{ display: 'none' }}
                />
              )}

              {(inputMode === 'video' || inputMode === 'webcam') && (
                <video ref={videoRef} playsInline muted style={{ display: 'none' }} />
              )}

              {/* Visible Rendering Canvas */}
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  maxHeight: '520px',
                  objectFit: 'contain',
                }}
              />

              {/* Top-Right Hold Timer HUD Overlay for Video/Webcam */}
              {(inputMode === 'webcam' || inputMode === 'video') &&
                (holdProgressMs > 0 || isHoldMastered) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      backgroundColor: isHoldMastered
                        ? 'rgba(16, 185, 129, 0.92)'
                        : 'rgba(17, 24, 39, 0.85)',
                      border: `1px solid ${isHoldMastered ? '#10B981' : '#374151'}`,
                      padding: '8px 14px',
                      borderRadius: '8px',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: '13px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    {isHoldMastered ? (
                      <Space>
                        <TrophyOutlined style={{ color: '#FBBF24', fontSize: '16px' }} />
                        <span>Mudra Mastered! (2.0s Hold Verified)</span>
                      </Space>
                    ) : (
                      <span>
                        Hold Steady: {holdSecondsText}s / 2.0s ({holdPercent}%)
                      </span>
                    )}
                  </div>
                )}

              {/* Skeleton Legend Overlay */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 12,
                  backgroundColor: 'rgba(0, 0, 0, 0.75)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              >
                <Space size="middle">
                  <span>
                    <span style={{ color: '#10B981', fontWeight: 'bold' }}>●</span> Within target
                    tolerance
                  </span>
                  <span>
                    <span style={{ color: '#F59E0B', fontWeight: 'bold' }}>●</span> Slight Deviation
                  </span>
                  <span>
                    <span style={{ color: '#EF4444', fontWeight: 'bold' }}>●</span> Incorrect Angle
                  </span>
                </Space>
              </div>
            </div>
          )}

          {/* Picture / Video Controls */}
          {inputMode === 'video' && !isWebcamActive && (
            <Flex justify="space-between" align="center" style={{ marginTop: '1rem' }}>
              <Upload
                accept="video/mp4,video/webm"
                showUploadList={false}
                beforeUpload={(file) => {
                  resetHoldTimer();
                  resetTemporalHistory();
                  const url = URL.createObjectURL(file);
                  if (videoRef.current) {
                    videoRef.current.src = url;
                    videoRef.current.onloadedmetadata = () => {
                      videoRef.current?.play();
                      lastFrameTimeRef.current = performance.now();
                      animationFrameIdRef.current = requestAnimationFrame(processVideoFrame);
                    };
                  }
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />}>Upload MP4 Hand Video</Button>
              </Upload>
              {isHoldMastered && (
                <Button icon={<ReloadOutlined />} onClick={resetHoldTimer}>
                  Reset 2s Hold
                </Button>
              )}
            </Flex>
          )}
        </Card>

        {/* Right Pane: Pedagogical Feedback & Mudra Info */}
        <Flex vertical gap="1.5rem" style={{ flex: 1 }}>
          {/* Real-time Match Score & Primary Directive */}
          <Card
            title={
              <Flex justify="space-between" align="center">
                <span>AI Coach Feedback</span>
                {isMeasurementUnavailable && (
                  <Tag color="error" icon={<ExclamationCircleOutlined />}>
                    Measurement Unavailable
                  </Tag>
                )}
                {!isMeasurementUnavailable && isHoldMastered && (
                  <Tag color="success" icon={<TrophyOutlined />}>
                    Mudra Mastered!
                  </Tag>
                )}
                {!isMeasurementUnavailable && !isHoldMastered && evaluationResult?.isMastered && (
                  <Tag color="processing" icon={<CheckCircleOutlined />}>
                    Hold Pose (2.0s)...
                  </Tag>
                )}
              </Flex>
            }
          >
            <Flex align="center" gap="1.5rem">
              <Progress
                type="circle"
                percent={isMeasurementUnavailable ? 0 : evaluationResult?.matchScore || 0}
                status={getScoreStatus(evaluationResult, isHoldMastered)}
                format={(percent) => (isMeasurementUnavailable ? 'N/A' : `${percent}%`)}
              />

              <div style={{ flex: 1 }}>
                <Text strong style={{ fontSize: '16px', display: 'block', marginBottom: '8px' }}>
                  Target: {currentMudra.name} ({currentMudra.malayalamName})
                </Text>
                <Alert
                  message={coachAlertMessage}
                  description={
                    evaluationResult?.primaryDirective ||
                    'Load a photo or start webcam to receive joint-level guidance.'
                  }
                  type={coachAlertType}
                  showIcon
                  icon={coachAlertIcon}
                />
              </div>
            </Flex>

            {/* 2.0-Second Continuous Hold Progress Bar for Video / Webcam */}
            {(inputMode === 'webcam' || inputMode === 'video') && (
              <div style={{ marginTop: '16px' }}>
                <Flex justify="space-between" align="center" style={{ marginBottom: '4px' }}>
                  <Text type="secondary" style={{ fontSize: '13px' }}>
                    2.0s Continuous Hold Stability:
                  </Text>
                  <Text
                    strong
                    style={{ fontSize: '13px', color: isHoldMastered ? '#10B981' : undefined }}
                  >
                    {isHoldMastered ? '2.0s / 2.0s (Verified!)' : `${holdSecondsText}s / 2.0s`}
                  </Text>
                </Flex>
                <Progress
                  percent={holdPercent}
                  status={holdProgressStatus}
                  strokeColor={isHoldMastered ? '#10B981' : '#3B82F6'}
                  showInfo={false}
                />
              </div>
            )}

            {evaluationResult?.secondaryDirective &&
              !isHoldMastered &&
              !isMeasurementUnavailable && (
                <Paragraph type="secondary" style={{ marginTop: '12px', marginBottom: 0 }}>
                  <ExclamationCircleOutlined /> Secondary Tip: {evaluationResult.secondaryDirective}
                </Paragraph>
              )}
          </Card>

          {/* Canonical Reference & Rules Card */}
          <Card title="Traditional Canonical Criteria">
            <Paragraph>{currentMudra.description}</Paragraph>
            <Divider style={{ margin: '8px 0' }} />
            <Text strong>Symbolic Interpretations:</Text>
            <div style={{ marginTop: '6px' }}>
              {currentMudra.symbolism.map((sym) => (
                <Tag key={sym} color="gold" style={{ marginBottom: '4px' }}>
                  {sym}
                </Tag>
              ))}
            </div>
          </Card>
        </Flex>
      </Flex>

      {/* Optional Developer Diagnostic View */}
      {showDiagnostics && (
        <Card
          title={
            <Flex justify="space-between" align="center" wrap="wrap" gap="0.5rem">
              <Space>
                <CodeOutlined />
                <span>Developer Diagnostic View (3D World-Landmark Telemetry & Calibration)</span>
              </Space>
              <Space wrap>
                <Button size="small" icon={<ReloadOutlined />} onClick={resetTemporalHistory}>
                  Reset Temporal Window
                </Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<CopyOutlined />}
                  onClick={handleCaptureCalibrationSnapshot}
                >
                  Capture Calibration Snapshot
                </Button>
              </Space>
            </Flex>
          }
          style={{ marginTop: '1.5rem' }}
        >
          <Space wrap style={{ marginBottom: '1rem' }}>
            <Tag color={latestKinematics ? 'blue' : 'error'}>
              Coordinate Source:{' '}
              {latestKinematics
                ? 'worldLandmarks (3D metric, meters)'
                : 'UNAVAILABLE (no valid worldLandmarks)'}
            </Tag>
            <Tag color="purple">
              Overlay Source: {isHandDetected2D ? 'landmarks (2D image-normalized)' : 'none'}
            </Tag>
            <Tag color={latestKinematics?.handedness === 'Unknown' ? 'warning' : 'cyan'}>
              Handedness: {latestKinematics?.handedness || 'Unknown'}
              {handednessScore !== null ? ` (${(handednessScore * 100).toFixed(1)}%)` : ''}
            </Tag>
            <Tag>
              Palm Length (0→9):{' '}
              {latestKinematics ? `${latestKinematics.palmScaleMeters.toFixed(4)} m` : 'N/A'}
            </Tag>
            <Tag>
              Palm Width (5→17):{' '}
              {latestKinematics ? `${latestKinematics.palmWidthMeters.toFixed(4)} m` : 'N/A'}
            </Tag>
            <Tag>
              Total Penalty / Weight: {evaluationResult?.totalWeightedPenalty ?? 0} /{' '}
              {evaluationResult?.totalWeight ?? 0}
            </Tag>
          </Space>

          <Table
            dataSource={evaluationResult?.jointEvaluations || []}
            columns={diagnosticColumns}
            rowKey="jointKey"
            pagination={false}
            size="small"
            locale={{
              emptyText: 'No valid 3D world-landmark evaluation available for the current frame.',
            }}
          />

          {auxiliaryClosureRows.length > 0 && (
            <>
              <Divider orientation="left" style={{ margin: '16px 0 8px' }}>
                Auxiliary Calibration Features (Unscored DIP Bend & Tip-to-MCP Closure)
              </Divider>
              <Table
                dataSource={auxiliaryClosureRows}
                rowKey="key"
                pagination={false}
                size="small"
                columns={[
                  { title: 'Finger', dataIndex: 'finger', key: 'finger' },
                  {
                    title: 'DIP Triplet',
                    dataIndex: 'dipTriplet',
                    key: 'dipTriplet',
                    render: (v: string) => <Tag>{v}</Tag>,
                  },
                  {
                    title: 'Measured DIP Bend',
                    dataIndex: 'dipDeg',
                    key: 'dipDeg',
                    render: (v: number) => `${v}°`,
                  },
                  {
                    title: 'DIP Temporal (mean ± σ)',
                    key: 'dipTemporal',
                    render: (_: unknown, row: (typeof auxiliaryClosureRows)[number]) =>
                      row.dipStats && row.dipStats.sampleCount > 0
                        ? `${row.dipStats.mean}° ± ${row.dipStats.stdDev}° [${row.dipStats.min}..${row.dipStats.max}]`
                        : '—',
                  },
                  {
                    title: 'Closure Pair',
                    dataIndex: 'closurePair',
                    key: 'closurePair',
                    render: (v: string) => <Tag>{v}</Tag>,
                  },
                  {
                    title: 'Tip-to-MCP Distance (norm 0↔9)',
                    dataIndex: 'closureDist',
                    key: 'closureDist',
                  },
                  {
                    title: 'Closure Temporal (mean ± σ)',
                    key: 'closureTemporal',
                    render: (_: unknown, row: (typeof auxiliaryClosureRows)[number]) =>
                      row.closureStats && row.closureStats.sampleCount > 0
                        ? `${row.closureStats.mean} ± ${row.closureStats.stdDev} [${row.closureStats.min}..${row.closureStats.max}]`
                        : '—',
                  },
                ]}
              />
            </>
          )}

          {capturedSnapshotJson && (
            <div style={{ marginTop: '1rem' }}>
              <Text strong>Captured Calibration Snapshot JSON:</Text>
              <pre
                data-testid="calibration-snapshot-json"
                style={{
                  marginTop: '8px',
                  padding: '12px',
                  backgroundColor: '#111827',
                  color: '#E5E7EB',
                  borderRadius: '6px',
                  maxHeight: '280px',
                  overflow: 'auto',
                  fontSize: '12px',
                }}
              >
                {capturedSnapshotJson}
              </pre>
            </div>
          )}
        </Card>
      )}

      {/* Bottom Table: Fine-Grained Joint Breakdown */}
      {evaluationResult && !isMeasurementUnavailable && (
        <Card
          title="3D Kinematic Joint Breakdown (Angular Discrepancies)"
          style={{ marginTop: '1.5rem' }}
        >
          <Table
            dataSource={evaluationResult.jointEvaluations}
            columns={jointColumns}
            rowKey="jointKey"
            pagination={false}
            size="small"
          />
        </Card>
      )}
    </Flex>
  );
};

export default MudraPracticePage;
