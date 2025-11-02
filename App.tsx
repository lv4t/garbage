
import React, { useState, useRef, useCallback } from 'react';
import { WasteCategory } from './types';
import { classifyWaste } from './services/geminiService';
import ResultDisplay from './components/ResultDisplay';
import Spinner from './components/Spinner';

const App: React.FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [classification, setClassification] = useState<WasteCategory | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setError(null);
      setClassification(null);
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClassify = useCallback(async () => {
    if (!imageFile) {
      setError("Vui lòng chọn một hình ảnh.");
      return;
    }
    setLoading(true);
    setError(null);
    setClassification(null);

    try {
      const result = await classifyWaste(imageFile);
      setClassification(result);
    } catch (err) {
      console.error(err);
      setError("Đã xảy ra lỗi trong quá trình phân tích. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [imageFile]);

  const handleReset = () => {
    setImageFile(null);
    setImageUrl(null);
    setClassification(null);
    setError(null);
    setLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <main className="w-full max-w-4xl mx-auto flex flex-col items-center text-center space-y-8">
        <header className="w-full">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-800">
            Trợ lý Phân loại Rác AI
          </h1>
          <p className="mt-2 text-lg text-gray-500">
            Tải ảnh rác thải của bạn lên để được phân loại chính xác.
          </p>
        </header>

        <div className="w-full max-w-2xl bg-white p-6 rounded-xl shadow-lg border border-gray-200 space-y-6">
          {imageUrl ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="w-full h-80 flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden">
                  <img src={imageUrl} alt="Uploaded preview" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full">
                <button
                  onClick={handleClassify}
                  disabled={loading}
                  className="w-full sm:w-1/2 flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                >
                  Phân loại
                </button>
                 <button
                  onClick={handleReset}
                  className="w-full sm:w-1/2 flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  Chọn ảnh khác
                </button>
              </div>
            </div>
          ) : (
             <div className="flex flex-col items-center justify-center w-full">
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    ref={fileInputRef}
                    className="hidden"
                    id="file-upload"
                />
                <label htmlFor="file-upload" className="w-full cursor-pointer px-6 py-4 border-2 border-dashed border-gray-300 rounded-md text-center text-gray-500 hover:border-blue-500 hover:text-blue-600 transition-colors">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="mt-2 block text-lg font-semibold">Tải ảnh lên để phân loại</span>
                    <span className="mt-1 block text-sm">PNG, JPG, GIF lên đến 10MB</span>
                </label>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center text-lg text-gray-600 p-4 bg-white rounded-lg shadow-md">
            <Spinner />
            <span>Đang phân tích, vui lòng đợi...</span>
          </div>
        )}

        {error && (
          <div className="w-full max-w-2xl p-4 text-center text-red-700 bg-red-100 border border-red-400 rounded-lg">
            {error}
          </div>
        )}

        {classification && !loading && (
          <ResultDisplay category={classification} />
        )}
      </main>
    </div>
  );
};

export default App;
