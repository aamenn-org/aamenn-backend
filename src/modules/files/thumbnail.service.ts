import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { encode } from 'blurhash';

export interface ThumbnailResult {
  small: Buffer; // 150x150
  medium: Buffer; // 800x800
  large: Buffer; // Target 20-30% of original file size
  blurhash: string; // Blurhash string for placeholder
  originalWidth: number;
  originalHeight: number;
}

export interface ThumbnailSizes {
  small: { width: number; height: number };
  medium: { width: number; height: number };
  large: { targetFileSizePercent: number }; // Target 20-30% of original file size
}

const THUMBNAIL_SIZES: ThumbnailSizes = {
  small: { width: 150, height: 150 },
  medium: { width: 800, height: 800 },
  large: { targetFileSizePercent: 25 }, // Target 25% (midpoint of 20-30%)
};

// Blurhash component count (affects hash length and detail)
const BLURHASH_COMPONENTS_X = 4;
const BLURHASH_COMPONENTS_Y = 3;

@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);

  /**
   * Generate thumbnails and blurhash from an image buffer
   * @param imageBuffer - The original image buffer
   * @returns ThumbnailResult with small, medium, large thumbnails and blurhash
   */
  async generateThumbnails(imageBuffer: Buffer): Promise<ThumbnailResult> {
    this.logger.debug('Starting thumbnail generation...');

    try {
      // Get original image metadata
      const metadata = await sharp(imageBuffer).metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;
      const originalSize = imageBuffer.length;

      this.logger.debug(
        `Original image size: ${originalWidth}x${originalHeight}, ${originalSize} bytes`,
      );

      // Generate thumbnails in parallel
      const [smallBuffer, mediumBuffer, largeBuffer, blurhash] = await Promise.all([
        this.generateThumbnail(
          imageBuffer,
          THUMBNAIL_SIZES.small.width,
          THUMBNAIL_SIZES.small.height,
        ),
        this.generateThumbnail(
          imageBuffer,
          THUMBNAIL_SIZES.medium.width,
          THUMBNAIL_SIZES.medium.height,
        ),
        this.generateLargeThumbnail(
          imageBuffer,
          originalSize,
          THUMBNAIL_SIZES.large.targetFileSizePercent,
        ),
        this.generateBlurhash(imageBuffer),
      ]);

      this.logger.debug(
        `Thumbnails generated - Small: ${smallBuffer.length} bytes, Medium: ${mediumBuffer.length} bytes, Large: ${largeBuffer.length} bytes (${((largeBuffer.length / originalSize) * 100).toFixed(1)}% of original)`,
      );
      this.logger.debug(`Blurhash: ${blurhash}`);

      return {
        small: smallBuffer,
        medium: mediumBuffer,
        large: largeBuffer,
        blurhash,
        originalWidth,
        originalHeight,
      };
    } catch (error) {
      this.logger.error('Failed to generate thumbnails:', error);
      throw error;
    }
  }

  /**
   * Generate a single thumbnail
   */
  private async generateThumbnail(
    imageBuffer: Buffer,
    width: number,
    height: number,
  ): Promise<Buffer> {
    // Create thumbnail with comprehensive processing
    const thumbnail = await sharp(imageBuffer)
      // Auto-orient based on EXIF (handles rotated phone photos)
      .rotate()

      // Remove alpha channel completely first
      .removeAlpha()

      // Convert to sRGB colorspace
      .toColourspace('srgb')

      // Resize with cover crop - fills entire dimensions
      .resize(width, height, {
        fit: 'cover',
        position: 'center',
        kernel: 'lanczos3', // High-quality downscaling kernel
      })

      // Flatten any remaining transparency with white background
      .flatten({ background: { r: 255, g: 255, b: 255 } })

      // Output as high-quality JPEG
      // Use 4:4:4 chroma subsampling to avoid edge artifacts
      .jpeg({
        quality: 85,
        progressive: true,
        chromaSubsampling: '4:4:4', // No chroma subsampling = no edge color bleeding
        force: true,
      })

      .toBuffer();

    return thumbnail;
  }

  /**
   * Generate large thumbnail targeting 20-30% of original file size
   * Uses iterative quality adjustment to hit target size
   */
  private async generateLargeThumbnail(
    imageBuffer: Buffer,
    originalSize: number,
    targetPercent: number,
  ): Promise<Buffer> {
    const targetSize = originalSize * (targetPercent / 100);
    const minTargetSize = originalSize * 0.20; // 20% minimum
    const maxTargetSize = originalSize * 0.30; // 30% maximum

    this.logger.debug(
      `Generating large thumbnail - Target: ${targetSize} bytes (${targetPercent}%), Range: ${minTargetSize}-${maxTargetSize} bytes`,
    );

    // Start with quality 80 and adjust based on results
    let quality = 80;
    let bestBuffer: Buffer | null = null;
    let bestDiff = Infinity;

    // Try up to 5 iterations to find optimal quality
    for (let attempt = 0; attempt < 5; attempt++) {
      const thumbnail = await sharp(imageBuffer)
        .rotate() // Auto-orient based on EXIF
        .removeAlpha()
        .toColourspace('srgb')
        // Use 'cover' fit to match medium thumbnail crop style
        // Fills entire dimensions with center crop
        .resize(1600, 1600, {
          fit: 'cover',
          position: 'center',
          kernel: 'lanczos3',
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({
          quality,
          progressive: true,
          chromaSubsampling: '4:4:4',
          force: true,
        })
        .toBuffer();

      const size = thumbnail.length;
      const diff = Math.abs(size - targetSize);

      this.logger.debug(
        `Attempt ${attempt + 1}: quality=${quality}, size=${size} bytes (${((size / originalSize) * 100).toFixed(1)}%)`,
      );

      // If within acceptable range (20-30%), use it
      if (size >= minTargetSize && size <= maxTargetSize) {
        this.logger.debug('Size within target range, using this thumbnail');
        return thumbnail;
      }

      // Track best result
      if (diff < bestDiff) {
        bestDiff = diff;
        bestBuffer = thumbnail;
      }

      // Adjust quality for next attempt
      if (size > maxTargetSize) {
        // Too large, reduce quality
        quality = Math.max(40, quality - 15);
      } else if (size < minTargetSize) {
        // Too small, increase quality
        quality = Math.min(95, quality + 10);
      }

      // If quality hasn't changed much, we've converged
      if (attempt > 0 && Math.abs(quality - (attempt === 1 ? 80 : quality)) < 5) {
        break;
      }
    }

    // Return best result even if not perfect
    this.logger.debug(
      `Using best result: ${bestBuffer!.length} bytes (${((bestBuffer!.length / originalSize) * 100).toFixed(1)}%)`,
    );
    return bestBuffer!;
  }

  /**
   * Generate blurhash string from image
   */
  private async generateBlurhash(imageBuffer: Buffer): Promise<string> {
    try {
      // Resize to small size for faster blurhash calculation
      const { data, info } = await sharp(imageBuffer)
        .resize(32, 32, { fit: 'cover' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Encode blurhash
      const blurhash = encode(
        new Uint8ClampedArray(data),
        info.width,
        info.height,
        BLURHASH_COMPONENTS_X,
        BLURHASH_COMPONENTS_Y,
      );

      return blurhash;
    } catch (error) {
      this.logger.warn('Failed to generate blurhash, using default:', error);
      // Return a simple gray blurhash as fallback
      return 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';
    }
  }

  /**
   * Check if a mime type is a supported image format
   */
  isImageSupported(mimeType: string): boolean {
    const supportedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
      'image/heic',
      'image/heif',
    ];
    return supportedTypes.includes(mimeType?.toLowerCase());
  }

  /**
   * Get thumbnail sizes configuration
   */
  getThumbnailSizes(): ThumbnailSizes {
    return THUMBNAIL_SIZES;
  }
}
