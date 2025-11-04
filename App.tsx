import React, { useState, useRef, useCallback, useEffect } from 'react';
import { WasteCategory } from './types';
import { classifyWaste } from './services/geminiService';
import ResultDisplay from './components/ResultDisplay';
import Spinner from './components/Spinner';

const App: React.FC = () => {
  const [classification, setClassification] = useState<WasteCategory | null>(null);
  const [isClassifying, setIsClassifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [scanInterval, setScanInterval] = useState<number>(2); // seconds
  const [isPaused, setIsPaused] = useState<boolean>(false);


  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<number | null>(null);

  const classifyFrame = useCallback(async () => {
    if (isClassifying || !videoRef.current || !canvasRef.current || videoRef.current.videoWidth === 0) {
      return;
    }

    setIsClassifying(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');

    if (context) {
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
            const result = await classifyWaste(file);
            if (intervalRef.current) { 
              setClassification(result);
              setError(null);
            }
          } catch (err) {
            console.error(err);
            if (intervalRef.current) {
              setError("Phân tích thất bại. Vui lòng thử lại.");
            }
          } finally {
            setIsClassifying(false);
          }
        } else {
          setIsClassifying(false);
        }
      }, 'image/jpeg');
    } else {
      setIsClassifying(false);
    }
  }, [isClassifying]);

  // Effect to manage camera stream
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
      // Cleanup state when camera is closed
      setClassification(null);
      setError(null);
      setIsClassifying(false);
      setIsPaused(false);
    }
  }, [isCameraOpen]);
  
  // Effect to manage classification interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isCameraOpen && !isPaused) {
      intervalRef.current = window.setInterval(classifyFrame, scanInterval * 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isCameraOpen, isPaused, scanInterval, classifyFrame]);


  const startRealtimeClassification = () => {
    setIsCameraOpen(true);
  };

  const stopRealtimeClassification = () => {
    setIsCameraOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <main className="w-full max-w-4xl mx-auto flex flex-col items-center text-center space-y-8">
        <header className="w-full">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-800">
            Trợ lý Phân loại Rác AI
          </h1>
          <p className="mt-2 text-lg text-gray-500">
            {isCameraOpen ? "Hướng camera vào vật thể để phân loại." : "Bắt đầu phân loại rác thải trong thời gian thực."}
          </p>
        </header>

        {isCameraOpen ? (
          <div className="w-full max-w-2xl bg-white p-6 rounded-xl shadow-lg border border-gray-200 space-y-6">
            <div className="w-full h-80 flex items-center justify-center bg-black rounded-lg overflow-hidden relative">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {isClassifying && !isPaused && (
                <div className="absolute top-2 right-2 flex items-center bg-black bg-opacity-50 text-white text-sm px-2 py-1 rounded">
                  <Spinner className="h-4 w-4 text-white" />
                  <span className="ml-2">Đang phân tích...</span>
                </div>
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
                        disabled={isPaused}
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

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full space-y-4 pt-10">
            <button onClick={startRealtimeClassification} className="w-full max-w-xs flex items-center justify-center px-8 py-4 border border-transparent text-lg font-medium rounded-full text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Bắt đầu phân loại
            </button>
          </div>
        )}

        {error && (
          <div className="w-full max-w-2xl p-4 text-center text-red-700 bg-red-100 border border-red-400 rounded-lg">
            {error}
          </div>
        )}

        {classification && isCameraOpen && (
          <ResultDisplay category={classification} />
        )}
      </main>
    </div>
  );
};

export default App;
