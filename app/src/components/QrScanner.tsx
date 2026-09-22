import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';

interface QrScannerProps {
  onResult: (text: string) => void;
  paused?: boolean;
}

type CameraStatus = 'initializing' | 'active' | 'error-permission' | 'error-no-device' | 'error-other';

export function QrScanner({ onResult, paused = false }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const [status, setStatus] = useState<CameraStatus>('initializing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (paused) {
      // スキャン停止
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch {
          // ignore
        }
        controlsRef.current = null;
      }
      return;
    }

    if (!videoRef.current) return;

    let cancelled = false;

    const startScanner = async () => {
      try {
        const reader = new BrowserQRCodeReader();
        readerRef.current = reader;

        // デバイス一覧を取得して存在確認
        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        if (cancelled) return;

        if (devices.length === 0) {
          setStatus('error-no-device');
          setErrorMessage('カメラデバイスが見つかりません。');
          return;
        }

        // 背面カメラを優先（なければ先頭）
        const deviceId =
          devices.find(d => /back|rear|environment/i.test(d.label))?.deviceId
          ?? devices[0].deviceId;

        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, err) => {
            if (cancelled) return;
            if (result) {
              onResult(result.getText());
            }
            // err は連続スキャン中の "not found" なので無視
            void err;
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setStatus('active');
      } catch (e: unknown) {
        if (cancelled) return;
        const err = e as Error;
        if (
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError'
        ) {
          setStatus('error-permission');
          setErrorMessage('カメラの使用が許可されていません。ブラウザの設定からカメラへのアクセスを許可してください。');
        } else if (
          err.name === 'NotFoundError' ||
          err.name === 'DevicesNotFoundError'
        ) {
          setStatus('error-no-device');
          setErrorMessage('カメラデバイスが見つかりません。');
        } else {
          setStatus('error-other');
          setErrorMessage(`カメラの起動に失敗しました: ${err.message}`);
        }
      }
    };

    setStatus('initializing');
    startScanner();

    return () => {
      cancelled = true;
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch {
          // ignore
        }
        controlsRef.current = null;
      }
      if (readerRef.current) {
        readerRef.current = null;
      }
    };
  }, [paused, onResult]);

  if (status === 'error-permission' || status === 'error-no-device' || status === 'error-other') {
    return (
      <div className="flex flex-col items-center justify-center w-full aspect-square max-w-sm bg-danger-bg rounded-2xl border border-danger/20 p-6 text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center">
          {/* camera-off icon */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </div>
        <p className="text-danger text-sm font-medium leading-relaxed">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-square max-w-sm rounded-2xl overflow-hidden bg-surface-dark shadow-elevated">
      {/* Video element */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
      />

      {/* Initializing overlay */}
      {status === 'initializing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-dark/80 space-y-3">
          <div className="w-10 h-10 border-2 border-gold/40 border-t-gold rounded-full animate-spin" />
          <p className="text-gold-gradient text-sm">カメラ起動中…</p>
        </div>
      )}

      {/* Paused overlay */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-dark/60 backdrop-blur-sm">
          <p className="text-white/80 text-sm font-medium">処理中…</p>
        </div>
      )}

      {/* Scan frame overlay — active state */}
      {status === 'active' && !paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-2/3 h-2/3">
            {/* Corner brackets */}
            <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-gold rounded-tl-md" />
            <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-gold rounded-tr-md" />
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-gold rounded-bl-md" />
            <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-gold rounded-br-md" />
          </div>
        </div>
      )}
    </div>
  );
}
