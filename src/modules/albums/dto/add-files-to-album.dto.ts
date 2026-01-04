import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMinSize, ArrayMaxSize } from 'class-validator';

/**
 * DTO for adding files to an album
 */
export class AddFilesToAlbumDto {
  @ApiProperty({
    description: 'Array of file UUIDs to add to the album',
    example: [
      '123e4567-e89b-12d3-a456-426614174000',
      '987fcdeb-51a2-3d4e-b678-426614174001',
    ],
    minItems: 1,
    maxItems: 100,
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  fileIds: string[];
}
