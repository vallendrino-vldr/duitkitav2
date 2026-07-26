import imageCompression from 'browser-image-compression';

/**
 * Compresses an image file to a maximum of 75KB.
 * Ensures the app stays well within the free-tier limits.
 * @param file The original File object
 * @returns A Promise resolving to the compressed File
 */
export async function compressImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 0.075, // 75KB
    maxWidthOrHeight: 1024,
    useWebWorker: true,
    initialQuality: 0.7, // Starting quality
  };

  try {
    const compressedBlob = await imageCompression(file, options);
    // Convert Blob back to File
    const compressedFile = new File([compressedBlob], file.name, {
      type: compressedBlob.type,
      lastModified: Date.now(),
    });
    return compressedFile;
  } catch (error) {
    console.error('Error compressing image:', error);
    throw error;
  }
}
