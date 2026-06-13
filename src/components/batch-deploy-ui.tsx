"use client";

import { useState } from "react";
import { Upload, Loader } from "lucide-react";

export function BatchDeployUI() {
  const [files, setFiles] = useState<File[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [results, setResults] = useState<Record<string, string> | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = Array.from(e.target.files || []);
    setFiles([...files, ...uploadedFiles]);
  };

  const handleDeploy = async () => {
    if (files.length === 0) {
      alert("이미지를 선택하세요");
      return;
    }

    setDeploying(true);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/emoticon/batch-deploy", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResults(data.deployResults);
      setFiles([]);
    } catch (error) {
      console.error("배포 실패:", error);
      alert("배포 중 오류가 발생했습니다");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">🎨 배치 멀티플랫폼 배포</h2>

      {/* 파일 업로드 */}
      <div className="border-2 border-dashed rounded-lg p-8 mb-6 text-center bg-gray-50">
        <Upload className="mx-auto mb-4 text-gray-400" size={48} />
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
          id="file-input"
        />
        <label htmlFor="file-input" className="cursor-pointer">
          <p className="text-lg font-semibold">이미지를 드래그하거나 클릭</p>
          <p className="text-sm text-gray-500">최대 32장 (카카오톡 기준)</p>
        </label>
      </div>

      {/* 선택된 파일 목록 */}
      {files.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold mb-2">선택된 파일 ({files.length})</h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {files.map((file, i) => (
              <p key={i} className="text-sm text-gray-600">✓ {file.name}</p>
            ))}
          </div>
        </div>
      )}

      {/* 배포 버튼 */}
      <button
        onClick={handleDeploy}
        disabled={files.length === 0 || deploying}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {deploying ? (
          <>
            <Loader size={20} className="animate-spin" />
            배포 중...
          </>
        ) : (
          <>🚀 모든 플랫폼에 배포</>
        )}
      </button>

      {/* 배포 결과 */}
      {results && (
        <div className="mt-8 p-4 bg-green-50 rounded-lg border border-green-200">
          <h3 className="font-bold text-green-800 mb-4">✅ 배포 완료!</h3>
          <div className="space-y-2">
            {Object.entries(results).map(([platform, path]) => (
              <div key={platform} className="flex items-center justify-between text-sm">
                <span className="font-semibold">{platform.toUpperCase()}</span>
                <span className="text-gray-600">{path}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
