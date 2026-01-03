import QRCode from 'qrcode';
import jsQR from 'jsqr';

// Generate QR code and render to canvas or img element
export async function generateQRCode(
  url: string,
  element: HTMLCanvasElement | HTMLImageElement,
  options: { width?: number; margin?: number; color?: { dark?: string; light?: string } } = {}
): Promise<void> {
  const defaultOptions = {
    width: options.width || 256,
    margin: options.margin || 2,
    color: {
      dark: options.color?.dark || '#000000',
      light: options.color?.light || '#ffffff',
    },
  };

  if (element instanceof HTMLCanvasElement) {
    await QRCode.toCanvas(element, url, defaultOptions);
  } else {
    const dataUrl = await QRCode.toDataURL(url, defaultOptions);
    element.src = dataUrl;
  }
}

// Extract club ID from URL
export function extractClubFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('club');
  } catch {
    // Try to extract from relative URL
    const match = url.match(/[?&]club=([A-Za-z0-9-]+)/i);
    return match ? match[1] : null;
  }
}

// Get club ID from current page URL
export function getClubFromCurrentUrl(): string | null {
  return new URLSearchParams(window.location.search).get('club');
}

// Build control page URL for a club
export function buildControlUrl(clubId: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/control/?club=${clubId}`;
}

// QR Scanner using BarcodeDetector or jsQR fallback
export class QRScanner {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private scanning = false;
  private onScan: (result: string) => void;
  private onError: (error: Error) => void;
  private barcodeDetector: BarcodeDetector | null = null;

  constructor(
    video: HTMLVideoElement,
    onScan: (result: string) => void,
    onError: (error: Error) => void = console.error
  ) {
    this.video = video;
    this.onScan = onScan;
    this.onError = onError;

    // Create offscreen canvas for jsQR
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    this.ctx = ctx;

    // Try to use BarcodeDetector API if available
    if ('BarcodeDetector' in window) {
      try {
        this.barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        console.log('BarcodeDetector not available, using jsQR fallback');
      }
    }
  }

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      this.video.srcObject = this.stream;
      await this.video.play();

      this.scanning = true;
      this.scanFrame();
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  stop(): void {
    this.scanning = false;

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.video.srcObject = null;
  }

  private async scanFrame(): Promise<void> {
    if (!this.scanning) return;

    try {
      if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
        const result = await this.detectQR();
        if (result) {
          this.stop();
          this.onScan(result);
          return;
        }
      }
    } catch (error) {
      console.error('Scan error:', error);
    }

    requestAnimationFrame(() => this.scanFrame());
  }

  private async detectQR(): Promise<string | null> {
    // Try BarcodeDetector first
    if (this.barcodeDetector) {
      try {
        const barcodes = await this.barcodeDetector.detect(this.video);
        if (barcodes.length > 0) {
          return barcodes[0].rawValue;
        }
      } catch {
        // Fall through to jsQR
      }
    }

    // Fallback to jsQR
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
    this.ctx.drawImage(this.video, 0, 0);

    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    return code?.data || null;
  }
}

// Type declaration for BarcodeDetector API
declare global {
  class BarcodeDetector {
    constructor(options?: { formats?: string[] });
    detect(image: ImageBitmapSource): Promise<{ rawValue: string }[]>;
  }
}
