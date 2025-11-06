
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { WasteCategory, ClassificationHistoryItem } from './types';
import { CATEGORY_DETAILS } from './constants';
import { classifyWaste } from './services/geminiService';
import ResultDisplay from './components/ResultDisplay';
import Spinner from './components/Spinner';

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const HISTORY_STORAGE_KEY = 'wasteClassificationHistory';
const MAX_HISTORY_ITEMS = 5; // Limit history to 5 items

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert blob to base64."));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// New utility function to convert any image to PNG blob
const convertToPngBlob = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(url);
                return reject(new Error("Failed to get 2D canvas context."));
            }
            ctx.drawImage(img, 0, 0, img.width, img.height);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Failed to convert canvas to PNG blob."));
                }
            }, 'image/png'); // Always convert to PNG
        };

        img.onerror = (error) => {
            URL.revokeObjectURL(url);
            reject(new Error(`Failed to load image for conversion: ${error}`));
        };

        img.src = url;
    });
};

const App: React.FC = () => {
  const [classification, setClassification] = useState<WasteCategory | null>(null);
  const [isClassifying, setIsClassifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [scanInterval, setScanInterval] = useState<number>(2); // seconds
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [flashColorClass, setFlashColorClass] = useState<string>('');
  const [showDetectionMessage, setShowDetectionMessage] = useState<boolean>(false);
  const [manualImageUrl, setManualImageUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<ClassificationHistoryItem[]>([]
  );

  // State for COCO-SSD object detection
  const [cocoSsdModel, setCocoSsdModel] = useState<any | null>(null); // Use 'any' to avoid type resolution issues
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [detectedObjects, setDetectedObjects] = useState<any[]>([]); // Use 'any[]'

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // For capturing image to send to Gemini
  const boundingCanvasRef = useRef<HTMLCanvasElement>(null); // For drawing bounding boxes
  const intervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetManualState = () => {
    setClassification(null);
    setError(null);
    if (manualImageUrl) {
        URL.revokeObjectURL(manualImageUrl);
    }
    setManualImageUrl(null);
    setIsClassifying(false);
  };

  const loadHistory = useCallback(() => {
    try {
      const storedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error("Failed to load history from localStorage", e);
      setHistory([]);
    }
  }, []);

  const saveHistory = useCallback((currentHistory: ClassificationHistoryItem[]) => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(currentHistory));
    }
    catch (e) {
      console.error("Failed to save history to localStorage", e);
    }
  }, []);

  const addToHistory = useCallback(async (item: Omit<ClassificationHistoryItem, 'id' | 'timestamp'> & { image: string }) => {
    setHistory(prevHistory => {
      const newItem: ClassificationHistoryItem = {
        ...item,
        id: Date.now().toString(), // Unique ID
        timestamp: new Date().toISOString(),
      };
      const newHistory = [newItem, ...prevHistory].slice(0, MAX_HISTORY_ITEMS);
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    setHistory([]);
  };

  // Function to draw bounding boxes
  const drawBoundingBoxes = useCallback((objects: any[]) => { // Use 'any[]'
    const canvas = boundingCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous drawings

    objects.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;
      const label = prediction.class;

      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#22c55e'; // Green-500 bounding box
      ctx.fillStyle = '#22c55e';   // Green-500 text background
      ctx.stroke();

      ctx.font = '16px Arial';
      ctx.textBaseline = 'top';
      const textWidth = ctx.measureText(label).width;
      const textHeight = parseInt(ctx.font, 10); // Get actual text height

      ctx.fillRect(x, y, textWidth + 8, textHeight + 8);
      ctx.fillStyle = '#ffffff'; // White text
      ctx.fillText(label, x + 4, y + 4);
    });
  }, []);

  const classifyFrame = useCallback(async () => {
    if (isClassifying || !videoRef.current || !canvasRef.current || videoRef.current.videoWidth === 0 || !cocoSsdModel) {
      // Clear bounding boxes if not classifying or model not ready
      if (boundingCanvasRef.current) {
        const ctx = boundingCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, boundingCanvasRef.current.width, boundingCanvasRef.current.height);
      }
      setDetectedObjects([]);
      return;
    }

    setIsClassifying(true);
    setError(null);
    setDetectedObjects([]); // Clear previous detections before new frame

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');

    if (context) {
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      
      // Perform object detection with COCO-SSD
      const predictions = await cocoSsdModel.detect(video);
      setDetectedObjects(predictions);
      drawBoundingBoxes(predictions);

      const isPersonDetected = predictions.some(p => p.class === 'person');

      if (isPersonDetected) {
        // If a person is detected, skip classification.
        setClassification(null); // Clear any previous classification.
        setIsClassifying(false); // Allow the next frame to be processed.
        return; // Exit the function early.
      }

      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            const file = new File([blob], "capture.jpeg", { type: "image/jpeg" });
            const result = await classifyWaste(file);
            if (intervalRef.current) { 
              setClassification(result);
              const imageUrl = await blobToBase64(blob);
              addToHistory({ image: imageUrl, category: result });
              setShowDetectionMessage(true); // Show detection message
              setTimeout(() => setShowDetectionMessage(false), 1000); // Hide after 1 second
            }
          } catch (err) {
            console.error(err);
            if (intervalRef.current) {
              setError("Phân tích thất bại. Vui lòng thử lại.");
            }
          } finally {
            setIsClassifying(false);
            // Bounding boxes will persist until the next classifyFrame or camera off
          }
        } else {
          setIsClassifying(false);
        }
      }, 'image/jpeg');
    } else {
      setIsClassifying(false);
    }
  }, [isClassifying, addToHistory, cocoSsdModel, drawBoundingBoxes]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Effect to load COCO-SSD model
  useEffect(() => {
    const loadModel = async () => {
      if (isCameraOpen && !cocoSsdModel && !isModelLoading) {
        setIsModelLoading(true);
        setError(null);
        try {
          await tf.ready();
          await tf.setBackend('webgl'); // Explicitly set WebGL backend
          const loadedModel = await cocoSsd.load();
          setCocoSsdModel(loadedModel);
        } catch (err) {
          console.error("Failed to load COCO-SSD model:", err);
          setError("Không thể tải mô hình nhận diện đối tượng. Vui lòng kiểm tra kết nối mạng.");
        } finally {
          setIsModelLoading(false);
        }
      }
    };
    loadModel();

    // Cleanup: Clear detected objects and bounding boxes when camera closes
    return () => {
        setDetectedObjects([]);
        if (boundingCanvasRef.current) {
            const ctx = boundingCanvasRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, boundingCanvasRef.current.width, boundingCanvasRef.current.height);
        }
    }
  }, [isCameraOpen, cocoSsdModel, isModelLoading]);

  useEffect(() => {
    if (isCameraOpen) {
      let stream: MediaStream | null = null;
      const startCamera = async () => {
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          } else {
            setError("Trình duyệt của bạn không hỗ trợ truy cập máy ảnh.");
            setIsCameraOpen(false);
          }
        } catch (err) {
          console.error("Error accessing camera: ", err);
          setError("Không thể truy cập máy ảnh. Vui lòng kiểm tra quyền truy cập và thử lại.");
          setIsCameraOpen(false);
        }
      };
      startCamera();

      return () => {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };
    } else {
      setClassification(null);
      setError(null);
      setIsClassifying(false);
      setIsPaused(false);
      setDetectedObjects([]); // Clear detections when camera is off
      if (boundingCanvasRef.current) { // Clear bounding box canvas
          const ctx = boundingCanvasRef.current.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, boundingCanvasRef.current.width, boundingCanvasRef.current.height);
      }
    }
  }, [isCameraOpen]);
  
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only start interval if model is loaded AND camera is open AND not paused
    if (isCameraOpen && !isPaused && cocoSsdModel) { 
      intervalRef.current = window.setInterval(classifyFrame, scanInterval * 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isCameraOpen, isPaused, scanInterval, classifyFrame, cocoSsdModel]);

  useEffect(() => {
    if (classification && isCameraOpen) {
      const details = CATEGORY_DETAILS[classification];
      const flashClass = `ring-4 ring-offset-2 ${details.flashColor}`;
      setFlashColorClass(flashClass);

      const timer = setTimeout(() => {
        setFlashColorClass('');
      }, 700); // Flash for 0.7 seconds

      return () => clearTimeout(timer);
    }
  }, [classification, isCameraOpen]);

  const startRealtimeClassification = () => {
    resetManualState();
    setIsCameraOpen(true);
  };

  const stopRealtimeClassification = () => {
    setIsCameraOpen(false);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    resetManualState();
    setIsClassifying(true);
    
    let processedFile = file;
    let imageForHistoryBase64: string;

    try {
        // Convert any uploaded file to PNG for consistent API compatibility
        const pngBlob = await convertToPngBlob(file);
        processedFile = new File([pngBlob], 'converted.png', { type: 'image/png' });
        imageForHistoryBase64 = await blobToBase64(pngBlob);
        
        // Use the converted PNG for the preview
        setManualImageUrl(URL.createObjectURL(processedFile));

        const result = await classifyWaste(processedFile);
        setClassification(result);
        addToHistory({ image: imageForHistoryBase64, category: result });
    } catch (err) {
        console.error(err);
        setError("Phân tích thất bại. Vui lòng thử lại.");
    } finally {
        setIsClassifying(false);
    }
    
    if (event.target) {
        event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <main className="w-full max-w-4xl mx-auto flex flex-col items-center text-center space-y-8">
        <header className="w-full">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-green-900">
            Trợ lý Phân loại Rác AI
          </h1>
          <p className="mt-2 text-lg text-green-700">
            {isCameraOpen ? "Hướng camera vào vật thể để phân loại." : "Chụp ảnh hoặc dùng camera để phân loại rác thải."}
          </p>
        </header>

        {isCameraOpen ? (
          <div className="w-full max-w-2xl bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-gray-200/50 space-y-6">
            <div className={`w-full h-80 flex items-center justify-center bg-black rounded-lg overflow-hidden relative transition-all duration-100 ease-out ${flashColorClass}`}>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover" 
                // Set dimensions to ensure canvas overlay matches
                onLoadedMetadata={(e) => {
                  if (videoRef.current && boundingCanvasRef.current) {
                    boundingCanvasRef.current.width = videoRef.current.videoWidth;
                    boundingCanvasRef.current.height = videoRef.current.videoHeight;
                  }
                }}
              />
              <canvas 
                ref={boundingCanvasRef} 
                className="absolute top-0 left-0 z-10 w-full h-full object-cover" 
              /> {/* Canvas for bounding boxes */}

              {(isClassifying || isModelLoading) && !isPaused && (
                <>
                  {/* Target icon */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <svg className="animate-pulse h-16 w-16 text-white stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                  </div>
                  {/* Loading message */}
                  <div className="absolute top-2 right-2 flex items-center bg-black bg-opacity-50 text-white text-sm px-2 py-1 rounded">
                    <Spinner className="h-4 w-4 text-white" />
                    <span className="ml-2">
                      {isModelLoading ? 'Đang tải mô hình...' : 'Đang phân tích...'}
                    </span>
                  </div>
                </>
              )}
               {isPaused && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60">
                    <div className="flex items-center text-white text-lg px-4 py-2 rounded">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="ml-2 font-semibold">Đã tạm dừng</span>
                    </div>
                </div>
              )}
              {showDetectionMessage && (
                <div className="absolute bottom-4 flex items-center justify-center px-4 py-2 bg-green-500 bg-opacity-80 text-white rounded-lg animate-slide-in">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Đã phát hiện đối tượng!</span>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="space-y-4 pt-2">
              <div className="flex flex-col items-center space-y-2">
                <label htmlFor="interval-slider" className="text-sm font-medium text-gray-700 select-none">
                  Tần suất quét: <span className="font-bold">{scanInterval} giây</span>
                </label>
                <div className="w-full px-2">
                    <input
                        id="interval-slider"
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        value={scanInterval}
                        onChange={(e) => setScanInterval(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isPaused || isModelLoading || !cocoSsdModel} // Disable if model not ready
                    />
                    <div className="w-full flex justify-between text-xs text-gray-500 mt-1">
                        <span>Nhanh</span>
                        <span>Chậm</span>
                    </div>
                </div>
              </div>
              
              <div className="flex space-x-4">
                <button 
                  onClick={() => setIsPaused(!isPaused)} 
                  className="w-1/2 flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400 transition-colors"
                  disabled={isModelLoading || !cocoSsdModel} // Disable if model not ready
                >
                  {isPaused ? 'Tiếp tục quét' : 'Tạm dừng quét'}
                </button>
                <button 
                  onClick={stopRealtimeClassification} 
                  className="w-1/2 flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                >
                  Dừng
                </button>
              </div>
            </div>

            {error && (
              <div className="w-full p-4 text-center text-red-700 bg-red-100 border border-red-400 rounded-lg">
                {error}
              </div>
            )}

            {classification && (
              <ResultDisplay key={classification} category={classification} />
            )}
          </div>
        ) : (
          <div className="w-full max-w-2xl mx-auto flex flex-col items-center text-center space-y-6">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              capture="environment"
              className="hidden"
            />

            <div className="w-full bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-gray-200/50 space-y-4">
              {manualImageUrl ? (
                <div className="w-full h-80 flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden relative">
                  <img src={manualImageUrl} alt="Xem trước" className="w-full h-full object-contain" />
                  {isClassifying && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 text-white">
                      <Spinner className="h-8 w-8 text-white" />
                      <span className="mt-2 text-lg">Đang phân tích...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-80 flex flex-col items-center justify-center bg-green-50/50 border-2 border-dashed border-green-300 rounded-lg text-green-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2">Hình ảnh sẽ được hiển thị ở đây</p>
                </div>
              )}
              
              {error && (
                  <div className="p-4 text-center text-red-700 bg-red-100 border border-red-400 rounded-lg">
                      {error}
                  </div>
              )}
              
              {classification && !isClassifying && (
                 <ResultDisplay key={classification} category={classification} />
              )}
            </div>

            <div className="w-full flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={isClassifying}
                className="flex-1 flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-green-300 disabled:cursor-not-allowed transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {manualImageUrl ? 'Chụp ảnh khác' : 'Chụp ảnh & Phân loại'}
              </button>
              <button 
                onClick={startRealtimeClassification}
                disabled={isClassifying}
                className="flex-1 flex items-center justify-center px-6 py-3 border border-green-600 text-base font-medium rounded-md text-green-700 bg-white hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Dùng camera trực tiếp
              </button>
            </div>

            {history.length > 0 && (
                <div className="w-full max-w-2xl bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-gray-200/50 space-y-4 mt-8 animate-slide-in">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold text-green-900">Lịch sử Phân loại</h2>
                        <button
                            onClick={clearHistory}
                            className="px-4 py-2 text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                        >
                            Xóa lịch sử
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {history.map((item) => {
                            const details = CATEGORY_DETAILS[item.category];
                            return (
                                <div key={item.id} className="flex items-center space-x-4 p-3 border border-gray-200 rounded-lg shadow-sm bg-white/50">
                                    <img src={item.image} alt="Lịch sử phân loại" className="w-16 h-16 object-cover rounded-md flex-shrink-0" />
                                    <div className="text-left flex-grow">
                                        <p className={`text-sm font-semibold ${details.colorClasses.split(' ')[0]}`}>{details.displayName}</p>
                                        <p className="text-xs text-gray-500">
                                            {new Date(item.timestamp).toLocaleString('vi-VN', {
                                                year: 'numeric', month: 'numeric', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;