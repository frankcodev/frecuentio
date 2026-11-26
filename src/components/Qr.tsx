import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function Qr({ value, size = 180 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size * 2 }).then(setSrc);
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt="Código QR" className="rounded-lg" /> : null;
}
