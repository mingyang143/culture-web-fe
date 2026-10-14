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
} from '@ant-design/icons';
import { useStyleToken } from 'themeStyles';
import useIsMobile from 'utils/isMobile';
import { CANONICAL_MUDRAS, DEFAULT_MUDRA_ID } from 'data/canonicalMudras';
import { extractHandKinematics } from 'utils/mudraKinematics';
import { evaluateMudraKinematics } from 'utils/mudraEvaluator';
import { handLandmarkerService, HAND_CONNECTIONS } from 'services/handLandmarkerService';
import { MudraEvaluationResult, Landmark3D, JointEvaluation } from 'types/mudra';

const { Title, Text, Paragraph } = Typography;

type InputMode = 'picture' | 'video' | 'webcam';

const SAMPLE_IMAGE_URLS = [
  {
    label: 'Sample Hand (Open Palm / Pataka)',
    url: '/samples/pataka_sample.jpg',
  },
  {
    label: 'Sample Mudra Gesture',
    url: '/samples/mudra_sample.jpg',
  },
];

const MudraPracticePage: React.FC = () => {
  const isMobile = useIsMobile();
  const styleToken = useStyleToken();

  const [selectedMudraId, setSelectedMudraId] = useState<string>(DEFAULT_MUDRA_ID);
  const [inputMode, setInputMode] = useState<InputMode>('picture');
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(SAMPLE_IMAGE_URLS[0].url);
  const [evaluationResult, setEvaluationResult] = useState<MudraEvaluationResult | null>(null);
  const [detectedLandmarks, setDetectedLandmarks] = useState<Landmark3D[] | null>(null);
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  const currentMudra = CANONICAL_MUDRAS[selectedMudraId] || CANONICAL_MUDRAS[DEFAULT_MUDRA_ID];
  const currentMudraRef = useRef<CanonicalMudra>(currentMudra);
  currentMudraRef.current = currentMudra;

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
    setIsWebcamActive(false);
  }, []);

  // Draw 21 landmarks and skeletal bones onto canvas
  const drawSkeleton = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      landmarks: Landmark3D[],
      width: number,
      height: number,
      evalRes: MudraEvaluationResult | null
    ) => {
      const handConnections = HAND_CONNECTIONS || [];

      // Determine global joint status map if evaluation result exists
      const jointStatusMap: Record<number, 'CORRECT' | 'MINOR_DEVIATION' | 'INCORRECT'> = {};
      if (evalRes) {
        const rank = (s: 'CORRECT' | 'MINOR_DEVIATION' | 'INCORRECT') =>
          s === 'INCORRECT' ? 3 : s === 'MINOR_DEVIATION' ? 2 : 1;

        const setStatus = (indices: number[], status: 'CORRECT' | 'MINOR_DEVIATION' | 'INCORRECT') => {
          indices.forEach((idx) => {
            const current = jointStatusMap[idx] || 'CORRECT';
            if (rank(status) > rank(current)) {
              jointStatusMap[idx] = status;
            }
          });
        };

        evalRes.jointEvaluations.forEach((je) => {
          const status = je.status;
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

        const startStatus = jointStatusMap[start] || 'CORRECT';
        const endStatus = jointStatusMap[end] || 'CORRECT';

        if (startStatus === 'INCORRECT' || endStatus === 'INCORRECT') {
          ctx.strokeStyle = '#EF4444'; // Red
        } else if (startStatus === 'MINOR_DEVIATION' || endStatus === 'MINOR_DEVIATION') {
          ctx.strokeStyle = '#F59E0B'; // Amber
        } else {
          ctx.strokeStyle = '#10B981'; // Green
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      // Draw landmark nodes
      landmarks.forEach((p, idx) => {
        const x = p.x * width;
        const y = p.y * height;
        const status = jointStatusMap[idx] || 'CORRECT';

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);

        if (status === 'INCORRECT') {
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

  // Process a static image
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

        if (result.landmarks && result.landmarks.length > 0) {
          const firstHandLandmarks = result.landmarks[0];
          setDetectedLandmarks(firstHandLandmarks);

          // Extract kinematics
          const kinematics = extractHandKinematics(firstHandLandmarks, 'Right');
          // Evaluate against current mudra
          const evalRes = evaluateMudraKinematics(kinematics, currentMudraRef.current);
          setEvaluationResult(evalRes);

          // Render skeleton
          drawSkeleton(ctx, firstHandLandmarks, canvas.width, canvas.height, evalRes);
        } else {
          setDetectedLandmarks(null);
          setEvaluationResult(null);
          message.warning('No hand detected in the image. Try a clearer hand photo.');
        }
      } catch (err) {
        console.error('Error analyzing image:', err);
        message.error('Failed to analyze hand image.');
      } finally {
        setIsProcessing(false);
      }
    },
    [currentMudra, drawSkeleton]
  );

  // Re-run analysis when mudra changes, image loads, or model finishes loading
  useEffect(() => {
    if (inputMode === 'picture' && !isLoadingModel && imageRef.current && imageRef.current.complete) {
      analyzeImage(imageRef.current);
    }
  }, [selectedMudraId, selectedImageUrl, inputMode, isLoadingModel, analyzeImage]);

  // Video frame loop
  const processVideoFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.paused || video.ended || video.readyState < 2) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    (async () => {
      try {
        const result = await handLandmarkerService.detectVideoFrame(video, performance.now());
        if (result.landmarks && result.landmarks.length > 0) {
          const firstHand = result.landmarks[0];
          setDetectedLandmarks(firstHand);

          const kinematics = extractHandKinematics(firstHand, 'Right');
          const evalRes = evaluateMudraKinematics(kinematics, currentMudraRef.current);
          setEvaluationResult(evalRes);

          drawSkeleton(ctx, firstHand, canvas.width, canvas.height, evalRes);
        }
      } catch (e) {
        // frame skip
      }
    })();

    animationFrameIdRef.current = requestAnimationFrame(processVideoFrame);
  }, [drawSkeleton]);

  // Start webcam
  const startWebcam = async () => {
    try {
      stopWebcam();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      webcamStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsWebcamActive(true);
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
    setInputMode(mode);
    setEvaluationResult(null);
    setDetectedLandmarks(null);

    if (mode === 'picture') {
      setTimeout(() => {
        if (imageRef.current) analyzeImage(imageRef.current);
      }, 100);
    }
  };

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

  return (
    <Flex vertical style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      {/* Page Header */}
      <Flex justify="space-between" align="center" wrap="wrap" style={{ marginBottom: '1.5rem' }}>
        <div>
          <Title level={2} style={{ margin: 0, color: styleToken.culture.cultureSectionHeadingTextStyle.color }}>
            MudraGuide: 3D Hand Pose Analysis & Feedback
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Real-time kinematic joint angle analysis for Kathakali Mudras powered by MediaPipe 3D Landmarks.
          </Paragraph>
        </div>

        <Space style={{ marginTop: isMobile ? '1rem' : 0 }}>
          <Text strong>Select Mudra:</Text>
          <Select
            value={selectedMudraId}
            style={{ width: 220 }}
            onChange={(val) => setSelectedMudraId(val)}
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
            <Button
              type={isWebcamActive ? 'default' : 'primary'}
              danger={isWebcamActive}
              onClick={isWebcamActive ? stopWebcam : startWebcam}
            >
              {isWebcamActive ? 'Stop Webcam' : 'Start Webcam'}
            </Button>
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
            <div style={{ position: 'relative', width: '100%', minHeight: '360px', backgroundColor: '#111827', borderRadius: '8px', overflow: 'hidden' }}>
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
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{ display: 'none' }}
                />
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
                  <span><span style={{ color: '#10B981', fontWeight: 'bold' }}>●</span> Correct Angle (&plusmn;15&deg;)</span>
                  <span><span style={{ color: '#F59E0B', fontWeight: 'bold' }}>●</span> Slight Deviation</span>
                  <span><span style={{ color: '#EF4444', fontWeight: 'bold' }}>●</span> Incorrect Angle</span>
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
                  const url = URL.createObjectURL(file);
                  if (videoRef.current) {
                    videoRef.current.src = url;
                    videoRef.current.onloadedmetadata = () => {
                      videoRef.current?.play();
                      animationFrameIdRef.current = requestAnimationFrame(processVideoFrame);
                    };
                  }
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />}>Upload MP4 Hand Video</Button>
              </Upload>
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
                {evaluationResult?.isMastered && (
                  <Tag color="success" icon={<CheckCircleOutlined />}>
                    Mastered
                  </Tag>
                )}
              </Flex>
            }
          >
            <Flex align="center" gap="1.5rem">
              <Progress
                type="circle"
                percent={evaluationResult?.matchScore || 0}
                status={
                  evaluationResult?.isMastered
                    ? 'success'
                    : (evaluationResult?.matchScore || 0) > 60
                    ? 'normal'
                    : 'exception'
                }
                format={(percent) => `${percent}%`}
              />

              <div style={{ flex: 1 }}>
                <Text strong style={{ fontSize: '16px', display: 'block', marginBottom: '8px' }}>
                  Target: {currentMudra.name} ({currentMudra.malayalamName})
                </Text>
                <Alert
                  message={
                    evaluationResult?.isMastered
                      ? 'Flawless Form! Position holds true to canonical Kathakali technique.'
                      : 'Actionable Adjustment'
                  }
                  description={
                    evaluationResult?.primaryDirective ||
                    'Load a photo or start webcam to receive joint-level guidance.'
                  }
                  type={evaluationResult?.isMastered ? 'success' : 'warning'}
                  showIcon
                  icon={evaluationResult?.isMastered ? <CheckCircleOutlined /> : <BulbOutlined />}
                />
              </div>
            </Flex>

            {evaluationResult?.secondaryDirective && (
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

      {/* Bottom Table: Fine-Grained Joint Breakdown */}
      {evaluationResult && (
        <Card title="3D Kinematic Joint Breakdown (Angular Discrepancies)" style={{ marginTop: '1.5rem' }}>
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
