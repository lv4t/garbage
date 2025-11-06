
import React from 'react';
import { WasteCategory } from '../types';
import { CATEGORY_DETAILS } from '../constants';

interface ResultDisplayProps {
  category: WasteCategory;
}

const ResultDisplay: React.FC<ResultDisplayProps> = ({ category }) => {
  const details = CATEGORY_DETAILS[category];

  if (!details) {
    return <div className="text-red-500">Lỗi: Không tìm thấy loại rác.</div>;
  }

  return (
    <div className="w-full max-w-2xl text-center space-y-4 md:space-y-6 animate-slide-in">
      <div className={`p-4 md:p-6 border-2 rounded-lg transition-all duration-300 ${details.colorClasses}`}>
        <h2 className="text-2xl md:text-3xl font-bold">{details.displayName}</h2>
      </div>
      <div className="text-left bg-white p-4 md:p-6 rounded-lg shadow-md border border-gray-200 space-y-3">
        <p className="text-base md:text-lg text-gray-800 font-semibold">{details.description}</p>
        <p className="text-sm md:text-base text-gray-600">{details.instructions}</p>
      </div>
    </div>
  );
};

export default ResultDisplay;
