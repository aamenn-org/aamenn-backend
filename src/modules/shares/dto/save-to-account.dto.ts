import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SaveFileItemDto {
  @ApiProperty({ description: 'Original file ID from the share' })
  @IsUUID()
  @IsNotEmpty()
  originalFileId: string;

  @ApiProperty({ description: 'File key re-encrypted with the saving user\'s master key' })
  @IsString()
  @IsNotEmpty()
  cipherFileKey: string;

  @ApiProperty({ description: 'Filename re-encrypted with the saving user\'s master key' })
  @IsString()
  @IsNotEmpty()
  fileNameEncrypted: string;
}

export class SaveToAccountDto {
  @ApiProperty({
    description: 'Files to save, each with re-encrypted key and filename',
    type: [SaveFileItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveFileItemDto)
  files: SaveFileItemDto[];
}

export class SaveToAccountResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 5 })
  savedCount: number;
}
