import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { encode } from 'blurhash';

export interface ThumbnailResult {
  small: Buffer; // 150x150
  medium: Buffer; // 800x800
  blurhash: string; // Blurhash string for placeholder
  originalWidth: number;
  originalHeight: number;
}

export interface ThumbnailSizes {
  small: { width: number; height: number };
  medium: { width: number; height: number };
}

const THUMBNAIL_SIZES: ThumbnailSizes = {
  small: { width: 150, height: 150 },
  medium: { width: 800, height: 800 },
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
   * @returns ThumbnailResult with small, medium thumbnails and blurhash
   */
  async generateThumbnails(imageBuffer: Buffer): Promise<ThumbnailResult> {
    this.logger.debug('Starting thumbnail generation...');

    try {
      // Get original image metadata
      const metadata = await sharp(imageBuffer).metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      this.logger.debug(
        `Original image size: ${originalWidth}x${originalHeight}`,
      );

      // Generate thumbnails in parallel
      const [smallBuffer, mediumBuffer, blurhash] = await Promise.all([
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
        this.generateBlurhash(imageBuffer),
      ]);

      this.logger.debug(
        `Thumbnails generated - Small: ${smallBuffer.length} bytes, Medium: ${mediumBuffer.length} bytes`,
      );
      this.logger.debug(`Blurhash: ${blurhash}`);

      return {
        small: smallBuffer,
        medium: mediumBuffer,
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
