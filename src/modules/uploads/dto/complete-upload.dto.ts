import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';

export class CompleteUploadDto {
  @ApiProperty({
    description: 'Ordered array of SHA-1 hashes for each uploaded part',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  partSha1Array: string[];

  @ApiPropertyOptional({ description: 'Base64-encoded encrypted small thumbnail' })
  @IsOptional()
  @IsString()
  thumbSmall?: string;

  @ApiPropertyOptional({ description: 'Base64-encoded encrypted medium thumbnail' })
  @IsOptional()
  @IsString()
  thumbMedium?: string;

  @ApiPropertyOptional({ description: 'Base64-encoded encrypted large thumbnail' })
  @IsOptional()
  @IsString()
  thumbLarge?: string;
}
