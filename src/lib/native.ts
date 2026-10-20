/** 原生壳（Capacitor）相关的小封装；在浏览器里全部优雅降级 */

export function isNative(): boolean {
  try {
    const cap = (globalThis as any).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** 调用系统相机拍照，返回 dataURL；浏览器里返回 null */
export async function nativePhoto(): Promise<string | null> {
  if (!isNative()) return null;
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    quality: 92,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    width: 1800,
    correctOrientation: true,
    saveToGallery: false,
  });
  return photo.dataUrl || null;
}

/** 从相册选图，返回 dataURL；浏览器里返回 null */
export async function nativePick(): Promise<string | null> {
  if (!isNative()) return null;
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    quality: 92,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Photos,
    width: 1800,
    correctOrientation: true,
  });
  return photo.dataUrl || null;
}
